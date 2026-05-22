import { App, normalizePath, TFile, moment } from "obsidian";

// Obsidian's exported `moment` is the moment.js callable, but its TS type
// is the namespace. Cast once at the import boundary.
const momentFn = moment as unknown as () => { format: (f: string) => string };
import { getTemplateSource } from "./template-source";

/**
 * Apply a template that matches the parent folder's name to a newly
 * created note. Prefers Templater's processing pipeline when available so
 * that `<% tp.* %>` syntax works; otherwise performs the limited
 * `{{title}}` / `{{date}}` / `{{time}}` substitution done by the core
 * Templates plugin.
 *
 * The brief wait before applying lets Obsidian finish opening the file in
 * the editor, which Templater needs to target the active file correctly.
 */
export async function applyFolderTemplateIfMatch(
  app: App,
  file: TFile,
): Promise<void> {
  const parent = file.parent;
  if (!parent || parent.isRoot()) return;

  const source = getTemplateSource(app);
  if (source.kind === "none") return;

  const templatesFolder = normalizePath(source.folder);
  if (isInside(file.path, templatesFolder)) return;

  const candidate = normalizePath(`${templatesFolder}/${parent.name}.md`);
  const templateFile = app.vault.getAbstractFileByPath(candidate);
  if (!(templateFile instanceof TFile)) return;

  // Safety net: refuse to overwrite a file that already has content (e.g.,
  // a file synced in from outside that happened to slip past the active-file
  // heuristic in the caller).
  const existing = await app.vault.read(file);
  if (existing.length > 0) return;

  await sleep(50);

  if (source.kind === "templater") {
    const ok = await tryTemplater(app, templateFile, file);
    if (ok) return;
  }

  await applyCore(app, templateFile, file);
}

async function tryTemplater(
  app: App,
  templateFile: TFile,
  targetFile: TFile,
): Promise<boolean> {
  try {
    const plugin = (app as unknown as {
      plugins?: { getPlugin?: (id: string) => unknown };
    }).plugins?.getPlugin?.("templater-obsidian") as
      | {
          templater?: {
            write_template_to_file?: (t: TFile, f: TFile) => Promise<void>;
          };
        }
      | undefined;
    const fn = plugin?.templater?.write_template_to_file;
    if (!fn) return false;
    await fn.call(plugin.templater, templateFile, targetFile);
    return true;
  } catch (err) {
    console.warn("[template-applicator] Templater apply failed, falling back", err);
    return false;
  }
}

async function applyCore(
  app: App,
  templateFile: TFile,
  targetFile: TFile,
): Promise<void> {
  const raw = await app.vault.read(templateFile);
  const formats = readCoreFormats(app);
  const now = momentFn();
  const substituted = raw
    .replace(/\{\{title\}\}/g, targetFile.basename)
    .replace(/\{\{date\}\}/g, now.format(formats.date))
    .replace(/\{\{time\}\}/g, now.format(formats.time));
  await app.vault.modify(targetFile, substituted);
}

function readCoreFormats(app: App): { date: string; time: string } {
  const fallback = { date: "YYYY-MM-DD", time: "HH:mm" };
  try {
    const internal = (app as unknown as {
      internalPlugins?: {
        getEnabledPluginById?: (id: string) => unknown;
      };
    }).internalPlugins;
    const plugin = internal?.getEnabledPluginById?.("templates") as
      | { instance?: { options?: { dateFormat?: string; timeFormat?: string } } }
      | undefined;
    return {
      date: plugin?.instance?.options?.dateFormat || fallback.date,
      time: plugin?.instance?.options?.timeFormat || fallback.time,
    };
  } catch {
    return fallback;
  }
}

function isInside(filePath: string, folderPath: string): boolean {
  const f = normalizePath(folderPath);
  return filePath === f || filePath.startsWith(f + "/");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
