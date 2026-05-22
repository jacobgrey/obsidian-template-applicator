import { App, TFolder, WorkspaceLeaf } from "obsidian";

/**
 * Tracks the folder most recently clicked in the file explorer sidebar.
 *
 * Obsidian exposes no public API for "currently selected folder," and the
 * internal leaf.view.tree.focusedItem property is undocumented and has
 * changed shape across versions. Instead we watch the file-explorer leaf's
 * DOM for clicks on `.nav-folder-title` and remember the last clicked
 * folder's `data-path`. This is robust across Obsidian updates because it
 * relies only on the rendered DOM, not on internal API shapes.
 */
export class FolderSelector {
  private lastSelectedPath: string | null = null;
  private attachedLeaves = new WeakSet<WorkspaceLeaf>();

  constructor(
    private app: App,
    private register: (cleanup: () => void) => void,
    private registerDomEvent: <K extends keyof HTMLElementEventMap>(
      el: HTMLElement,
      type: K,
      handler: (ev: HTMLElementEventMap[K]) => void,
    ) => void,
  ) {}

  start(): void {
    this.attachToFileExplorers();
    const evt = this.app.workspace.on("layout-change", () => {
      this.attachToFileExplorers();
    });
    this.register(() => this.app.workspace.offref(evt));
  }

  getSelectedFolder(): TFolder | null {
    if (!this.lastSelectedPath) return null;
    const f = this.app.vault.getAbstractFileByPath(this.lastSelectedPath);
    if (f instanceof TFolder) return f;
    this.lastSelectedPath = null;
    return null;
  }

  private attachToFileExplorers(): void {
    const leaves = this.app.workspace.getLeavesOfType("file-explorer");
    for (const leaf of leaves) {
      if (this.attachedLeaves.has(leaf)) continue;
      const el = (leaf.view as unknown as { containerEl?: HTMLElement }).containerEl;
      if (!el) continue;
      this.registerDomEvent(el, "click", (ev) => this.onClick(ev));
      this.attachedLeaves.add(leaf);
    }
  }

  private onClick(ev: MouseEvent): void {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const folderTitle = target.closest(".nav-folder-title");
    if (folderTitle) {
      const path = folderTitle.getAttribute("data-path");
      if (path !== null) this.lastSelectedPath = path;
    }
  }
}
