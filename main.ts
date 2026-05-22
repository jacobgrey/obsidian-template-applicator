import { Plugin, TFile, TFolder } from "obsidian";
import { FolderSelector } from "./src/folder-selector";
import { applyFolderTemplateIfMatch } from "./src/template-applier";
import {
  DEFAULT_SETTINGS,
  TemplateApplicatorSettings,
  TemplateApplicatorSettingTab,
} from "./src/settings";

type FileManagerWithInternals = {
  getNewFileParent?: (sourcePath: string) => TFolder;
  createNewMarkdownFile?: (location: TFolder, filename?: string) => Promise<TFile>;
};

export default class TemplateApplicatorPlugin extends Plugin {
  settings!: TemplateApplicatorSettings;
  private folderSelector!: FolderSelector;
  private originalGetNewFileParent: ((sourcePath: string) => TFolder) | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.folderSelector = new FolderSelector(
      this.app,
      (cleanup) => this.register(cleanup),
      (el, type, handler) => this.registerDomEvent(el, type, handler),
    );
    this.folderSelector.start();

    this.installNewFileParentPatch();

    this.addCommand({
      id: "new-note-in-selected-folder",
      name: "New note in selected folder",
      callback: () => void this.createNoteInSelectedFolder(),
    });

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof TFile)) return;
        if (file.extension !== "md") return;
        if (!this.settings.applyFolderTemplates) return;
        // Defer: vault.on('create') fires before Obsidian opens the new
        // note as the active file, so the user-creation heuristic needs
        // to run after the workspace has settled.
        window.setTimeout(() => {
          if (!this.isLikelyUserCreation(file)) return;
          void applyFolderTemplateIfMatch(this.app, file);
        }, 100);
      }),
    );

    this.addSettingTab(new TemplateApplicatorSettingTab(this.app, this));
  }

  onunload(): void {
    this.restoreNewFileParentPatch();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private installNewFileParentPatch(): void {
    const fm = this.app.fileManager as unknown as FileManagerWithInternals;
    const original = fm.getNewFileParent;
    if (typeof original !== "function") {
      console.warn(
        "[template-applicator] app.fileManager.getNewFileParent not available; Ctrl+N override disabled (the explicit command still works).",
      );
      return;
    }
    this.originalGetNewFileParent = original.bind(fm);
    const self = this;
    fm.getNewFileParent = function (sourcePath: string): TFolder {
      if (!self.settings.routeNewNotesToSelectedFolder) {
        return self.originalGetNewFileParent!(sourcePath);
      }
      const selected = self.folderSelector.getSelectedFolder();
      if (selected) return selected;
      return self.originalGetNewFileParent!(sourcePath);
    };
  }

  private restoreNewFileParentPatch(): void {
    if (!this.originalGetNewFileParent) return;
    const fm = this.app.fileManager as unknown as FileManagerWithInternals;
    fm.getNewFileParent = this.originalGetNewFileParent;
    this.originalGetNewFileParent = null;
  }

  private async createNoteInSelectedFolder(): Promise<void> {
    const fm = this.app.fileManager as unknown as FileManagerWithInternals;
    const create = fm.createNewMarkdownFile;
    if (typeof create !== "function") {
      console.warn("[template-applicator] createNewMarkdownFile not available.");
      return;
    }

    const folder =
      (this.settings.routeNewNotesToSelectedFolder
        ? this.folderSelector.getSelectedFolder()
        : null) ??
      (this.originalGetNewFileParent
        ? this.originalGetNewFileParent("")
        : this.app.vault.getRoot());

    const file = await create.call(fm, folder, "");
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  private isLikelyUserCreation(file: TFile): boolean {
    const recent = Date.now() - file.stat.ctime < 1500;
    const isActive = this.app.workspace.getActiveFile()?.path === file.path;
    return recent && isActive;
  }
}
