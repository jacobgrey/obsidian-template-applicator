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
        // Recency check distinguishes a real new-note creation from the
        // initial vault scan that fires create events on every existing
        // file at startup. Empty-content guard inside the applier
        // handles synced/imported files.
        if (Date.now() - file.stat.ctime > 5000) return;
        // Defer so Obsidian finishes opening the new file before the
        // applier writes to it — keeps the editor view in sync.
        window.setTimeout(() => {
          console.info("[template-applicator] create event ->", file.path);
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

}
