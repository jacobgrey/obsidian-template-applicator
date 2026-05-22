import { App } from "obsidian";

export type TemplateSource =
  | { kind: "templater"; folder: string }
  | { kind: "core"; folder: string }
  | { kind: "none" };

const LOG = "[template-applicator]";

/**
 * Discover the user's templates folder.
 *
 * Canonical access paths (verified against current upstream sources):
 *
 *   Templater (community, id "templater-obsidian"):
 *     app.plugins.getPlugin("templater-obsidian").settings.templates_folder
 *     - `templates_folder` is the declared field name in Templater's own
 *       Settings.ts. Documented within Templater's source.
 *
 *   Core Templates (internal, id "templates"):
 *     app.internalPlugins.getPluginById("templates").instance.options.folder
 *     - `getPluginById` returns the *wrapper* (has .instance, .enabled);
 *       `getEnabledPluginById` returns the *instance directly* (no
 *       .instance) and yields null when the plugin is disabled. The
 *       wrapper variant is the idiomatic choice used by Templater and
 *       Periodic Notes: it works whether or not the plugin is enabled,
 *       and the call shape matches the empirically-stable
 *       `internalPlugins.plugins[id]` dict access.
 *     - `.instance.options.folder` is not in the public Obsidian API but
 *       is the de-facto-stable shape per obsidian-typings.
 *
 * When neither resolves, dump diagnostics so an unfamiliar install can
 * report what its actual shape looks like instead of failing silently.
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
  const plugin = (app as unknown as {
    plugins: { getPlugin: (id: string) => unknown };
  }).plugins.getPlugin("templater-obsidian") as
    | { settings?: { templates_folder?: string } }
    | null;
  const folder = plugin?.settings?.templates_folder;
  return typeof folder === "string" && folder.length > 0 ? folder : null;
}

function tryCore(app: App): string | null {
  const plugin = (app as unknown as {
    internalPlugins: { getPluginById: (id: string) => unknown };
  }).internalPlugins.getPluginById("templates") as
    | { instance?: { options?: { folder?: string } } }
    | null;
  const folder = plugin?.instance?.options?.folder;
  return typeof folder === "string" && folder.length > 0 ? folder : null;
}

function dumpDiagnostics(app: App): void {
  console.warn(`${LOG} templates folder not detected via canonical paths. Diagnostics:`);
  try {
    const community = (app as unknown as {
      plugins?: { plugins?: Record<string, unknown> };
    }).plugins?.plugins;
    console.warn(`${LOG}   enabled community plugin ids:`, community ? Object.keys(community) : "(unreachable)");
    const templater = community?.["templater-obsidian"] as
      | { settings?: unknown }
      | undefined;
    if (templater?.settings) {
      console.warn(`${LOG}   templater settings (raw):`, templater.settings);
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
    }
  } catch (err) {
    console.warn(`${LOG}   internal plugins probe failed:`, err);
  }
}
