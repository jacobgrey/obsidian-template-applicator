import { App, PluginSettingTab, Setting } from "obsidian";
import type TemplateApplicatorPlugin from "../main";
import { getTemplateSource } from "./template-source";

export interface TemplateApplicatorSettings {
  routeNewNotesToSelectedFolder: boolean;
  applyFolderTemplates: boolean;
}

export const DEFAULT_SETTINGS: TemplateApplicatorSettings = {
  routeNewNotesToSelectedFolder: true,
  applyFolderTemplates: true,
};

export class TemplateApplicatorSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: TemplateApplicatorPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Create new notes in selected folder")
      .setDesc(
        "When you click a folder in the file explorer, the next 'New note' (Ctrl/Cmd+N, ribbon, or the dedicated command) is placed in that folder. Falls back to Obsidian's default when nothing is selected.",
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.routeNewNotesToSelectedFolder)
          .onChange(async (v) => {
            this.plugin.settings.routeNewNotesToSelectedFolder = v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Apply folder-name templates")
      .setDesc(
        "When a new note is created inside a folder, look for a template with the same name as the folder in your templates folder and apply it.",
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.applyFolderTemplates)
          .onChange(async (v) => {
            this.plugin.settings.applyFolderTemplates = v;
            await this.plugin.saveSettings();
          }),
      );

    const source = getTemplateSource(this.app);
    const status = containerEl.createDiv({ cls: "template-applicator-status" });
    if (source.kind === "templater") {
      status.setText(`Detected templates folder: "${source.folder}" (Templater).`);
    } else if (source.kind === "core") {
      status.setText(`Detected templates folder: "${source.folder}" (core Templates plugin).`);
    } else {
      status.setText(
        "No templates folder detected. Configure either the core Templates plugin or Templater to set a templates folder; otherwise folder-name templates cannot be applied.",
      );
    }
  }
}
