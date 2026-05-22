import { App, normalizePath, TFile, moment } from "obsidian";
import { getTemplateSource } from "./template-source";

// Obsidian's exported `moment` is the moment.js callable, but its TS type
// is the namespace. Cast once at the import boundary.
const momentFn = moment as unknown as () => { format: (f: string) => string };

const LOG = "[template-applicator]";

/**
 * Apply a template that matches the parent folder's name to a newly
 * created note. Prefers Templater's processing pipeline when available so
 * that `<% tp.* %>` syntax works; otherwise performs the limited
 * `{{title}}` / `{{date}}` / `{{time}}` substitution done by the core
 * Templates plugin.
 */
export async function applyFolderTemplateIfMatch(
  app: App,
  file: TFile,
): Promise<void> {
  const parent = file.parent;
  if (!parent || parent.isRoot()) {
    console.info(LOG, "skip: file is in vault root or has no parent", file.path);
    return;
  }

  const source = getTemplateSource(app);
  if (source.kind === "none") {
    console.info(LOG, "skip: no templates folder configured (check Templater or core Templates settings)");
    return;
  }
  console.info(LOG, `template source: ${source.kind} -> "${source.folder}"`);

  const templatesFolder = normalizePath(source.folder);
  if (isInside(file.path, templatesFolder)) {
    console.info(LOG, "skip: new file is inside the templates folder");
    return;
  }

  const candidate = normalizePath(`${templatesFolder}/${parent.name}.md`);
  const templateFile = app.vault.getAbstractFileByPath(candidate);
  if (!(templateFile instanceof TFile)) {
    console.info(
      LOG,
      `skip: no matching template at "${candidate}" (folder "${parent.name}" needs a same-named file there)`,
    );
    return;
  }
  console.info(LOG, `match: "${candidate}" -> "${file.path}"`);

  const existing = await app.vault.read(file);
  if (existing.length > 0) {
    console.info(LOG, "skip: target file already has content, refusing to overwrite");
    return;
  }

  if (source.kind === "templater") {
    const ok = await tryTemplater(app, templateFile, file);
    if (ok) {
      console.info(LOG, "applied via Templater");
      return;
    }
    console.info(LOG, "Templater path did not apply; falling back to core substitution");
  }

  await applyCore(app, templateFile, file);
  console.info(LOG, "applied via core substitution");
}

async function tryTemplater(
  app: App,
  templateFile: TFile,
  targetFile: TFile,
): Promise<boolean> {
  const plugin = (app as unknown as {
    plugins?: { getPlugin?: (id: string) => unknown };
  }).plugins?.getPlugin?.("templater-obsidian") as
    | {
        templater?: Record<string, unknown>;
      }
    | undefined;
  const t = plugin?.templater;
  if (!t) {
    console.warn(LOG, "Templater plugin object not reachable at plugins.templater-obsidian.templater");
    return false;
  }

  // Templater's external API has changed names across versions. Try the
  // known method names in order and use the first that's callable.
  const candidates = [
    "write_template_to_file",
    "append_template_to_active_file",
    "overwrite_file_commands",
  ] as const;
  for (const name of candidates) {
    const fn = t[name];
    if (typeof fn === "function") {
      try {
        await (fn as (...a: unknown[]) => Promise<void>).call(t, templateFile, targetFile);
        return true;
      } catch (err) {
        console.warn(LOG, `Templater.${name} threw, trying next`, err);
      }
    }
  }
  console.warn(LOG, "no usable Templater apply method found; templater object keys:", Object.keys(t));
  return false;
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
