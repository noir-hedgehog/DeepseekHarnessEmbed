import { ItemView, WorkspaceLeaf } from "obsidian";

export const VIEW_TYPE_WEB_PREVIEW = "dsh-embed-web-preview";

interface WebPreviewState {
  /** Absolute filesystem path of the file being previewed. */
  path?: string;
}

/**
 * Center-column browser preview for web-native files clicked in the DSH
 * panel (html/htm/xhtml/svg/xml). Uses Electron's <webview> — the same tag
 * Obsidian's core Web viewer uses — so the file renders as a real browser
 * page and its relative file:// resources (css/js/img) resolve naturally.
 * Desktop-only is fine: the whole plugin is desktop-only.
 */
export class WebPreviewView extends ItemView {
  private filePath = "";

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_WEB_PREVIEW;
  }

  getDisplayText(): string {
    const name = this.filePath.split("/").pop();
    return name || "预览";
  }

  getIcon(): string {
    return "globe";
  }

  /** Obsidian calls this on setViewState and on workspace restore. */
  async setState(state: WebPreviewState): Promise<void> {
    if (state && typeof state.path === "string" && state.path !== this.filePath) {
      this.filePath = state.path;
      this.renderWebview();
      // Refresh the tab title once the path is known.
      (this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
    }
    return Promise.resolve();
  }

  getState(): Record<string, unknown> {
    return { path: this.filePath };
  }

  protected async onOpen(): Promise<void> {
    this.renderWebview();
    return Promise.resolve();
  }

  private renderWebview(): void {
    const el = this.contentEl;
    el.empty();
    el.addClass("dsh-embed-web-preview");
    if (!this.filePath) return;
    const wv = document.createElement("webview");
    // Encode each path segment independently so POSIX separators survive.
    wv.setAttribute(
      "src",
      "file://" + this.filePath.split("/").map(encodeURIComponent).join("/"),
    );
    wv.setAttribute("allowpopups", "true");
    wv.classList.add("dsh-embed-web-preview-frame");
    el.appendChild(wv);
  }
}
