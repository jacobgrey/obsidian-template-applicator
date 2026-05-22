import { App } from "obsidian";

export type TemplateSource =
  | { kind: "templater"; folder: string }
  | { kind: "core"; folder: string }
  | { kind: "none" };

const LOG = "[template-applicator]";

/**
 * Discover the user's templates folder by reading plugin settings.
 *
 * Both the community Templater plugin and the core Templates plugin store
 * their template-folder paths in undocumented locations whose shape has
 * changed across versions. Probe several known shapes/field names and log
 * a diagnostic dump when none match, so users can paste back what their
 * install actually looks like.
 */
export function getTemplateSource(app: App): TemplateSource {
  const fromTemplater = tryTemplater(app);
  if (fromTemplater) return { kind: "templater", folder: fromTemplater };

  const fromCore = tryCore(app);
  if (fromCore) return { kind: "core", folder: fromCore };

  dumpDiagnostics(app);
  return { kind: "none" };
}

function tryTemplater(app: App): string | null {
  const plugin = getCommunityPlugin(app, "templater-obsidian");
  if (!plugin) return null;
  // Templater has used several names for the folder field across versions.
  const settings = (plugin as { settings?: Record<string, unknown> }).settings;
  return readStringField(settings, [
    "templates_folder",
    "template_folder",
    "templates_folder_path",
    "folder",
  ]);
}

function tryCore(app: App): string | null {
  const plugin = getInternalPlugin(app, "templates");
  if (!plugin) return null;
  const opts =
    (plugin as { instance?: { options?: Record<string, unknown> } }).instance?.options ??
    (plugin as { options?: Record<string, unknown> }).options;
  return readStringField(opts, ["folder", "template_folder", "templatesFolder"]);
}

function getCommunityPlugin(app: App, id: string): unknown {
  const mgr = (app as unknown as {
    plugins?: {
      getPlugin?: (id: string) => unknown;
      plugins?: Record<string, unknown>;
    };
  }).plugins;
  if (!mgr) return null;
  try {
    const viaFn = mgr.getPlugin?.(id);
    if (viaFn) return viaFn;
  } catch {
    /* fall through */
  }
  return mgr.plugins?.[id] ?? null;
}

function getInternalPlugin(app: App, id: string): unknown {
  const mgr = (app as unknown as {
    internalPlugins?: {
      getEnabledPluginById?: (id: string) => unknown;
      getPluginById?: (id: string) => unknown;
      plugins?: Record<string, unknown>;
    };
  }).internalPlugins;
  if (!mgr) return null;
  try {
    const viaEnabled = mgr.getEnabledPluginById?.(id);
    if (viaEnabled) return viaEnabled;
  } catch {
    /* fall through */
  }
  try {
    const viaGet = mgr.getPluginById?.(id);
    if (viaGet) return viaGet;
  } catch {
    /* fall through */
  }
  return mgr.plugins?.[id] ?? null;
}

function readStringField(obj: Record<string, unknown> | undefined, names: string[]): string | null {
  if (!obj) return null;
  for (const n of names) {
    const v = obj[n];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function dumpDiagnostics(app: App): void {
  console.warn(`${LOG} templates folder not detected. Diagnostics follow.`);
  try {
    const community = (app as unknown as {
      plugins?: { plugins?: Record<string, unknown> };
    }).plugins?.plugins;
    console.warn(`${LOG}   enabled community plugin ids:`, community ? Object.keys(community) : "(unreachable)");
    const templater = community?.["templater-obsidian"] as
      | { settings?: unknown }
      | undefined;
    if (templater) {
      console.warn(`${LOG}   templater settings keys:`, templater.settings ? Object.keys(templater.settings as Record<string, unknown>) : "(no settings)");
      console.warn(`${LOG}   templater settings (raw):`, templater.settings);
    } else {
      console.warn(`${LOG}   Templater (id "templater-obsidian") not present`);
    }
  } catch (err) {
    console.warn(`${LOG}   community plugins probe failed:`, err);
  }
  try {
    const internal = (app as unknown as {
      internalPlugins?: { plugins?: Record<string, unknown> };
    }).internalPlugins?.plugins;
    console.warn(`${LOG}   internal plugin ids:`, internal ? Object.keys(internal) : "(unreachable)");
    const core = internal?.["templates"] as
      | { enabled?: boolean; instance?: { options?: unknown } }
      | undefined;
    if (core) {
      console.warn(`${LOG}   core Templates enabled:`, core.enabled);
      console.warn(`${LOG}   core Templates options (raw):`, core.instance?.options);
    } else {
      console.warn(`${LOG}   core Templates plugin not present`);
    }
  } catch (err) {
    console.warn(`${LOG}   internal plugins probe failed:`, err);
  }
}
