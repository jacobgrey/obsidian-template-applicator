import { App } from "obsidian";

export type TemplateSource =
  | { kind: "templater"; folder: string }
  | { kind: "core"; folder: string }
  | { kind: "none" };

/**
 * Discover the user's templates folder by reading plugin settings.
 *
 * Prefer Templater (community plugin, settings are accessed through the
 * public plugin manager). Fall back to the core Templates plugin, which is
 * only reachable via internal APIs.
 */
export function getTemplateSource(app: App): TemplateSource {
  const fromTemplater = tryTemplater(app);
  if (fromTemplater) return { kind: "templater", folder: fromTemplater };

  const fromCore = tryCore(app);
  if (fromCore) return { kind: "core", folder: fromCore };

  return { kind: "none" };
}

function tryTemplater(app: App): string | null {
  try {
    const plugin = (app as unknown as {
      plugins?: { getPlugin?: (id: string) => unknown };
    }).plugins?.getPlugin?.("templater-obsidian") as
      | { settings?: { templates_folder?: string } }
      | undefined;
    const folder = plugin?.settings?.templates_folder;
    return typeof folder === "string" && folder.length > 0 ? folder : null;
  } catch {
    return null;
  }
}

function tryCore(app: App): string | null {
  try {
    const internal = (app as unknown as {
      internalPlugins?: {
        getEnabledPluginById?: (id: string) => unknown;
      };
    }).internalPlugins;
    const plugin = internal?.getEnabledPluginById?.("templates") as
      | { instance?: { options?: { folder?: string } } }
      | undefined;
    const folder = plugin?.instance?.options?.folder;
    return typeof folder === "string" && folder.length > 0 ? folder : null;
  } catch {
    return null;
  }
}
