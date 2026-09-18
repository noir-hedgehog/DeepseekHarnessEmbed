import { ItemView, Notice, requestUrl, WorkspaceLeaf } from "obsidian";
import type DshEmbedPlugin from "./main";

export const VIEW_TYPE_DSH_EMBED = "dsh-embed-view";

export class DshEmbedView extends ItemView {
  /** The live embed iframe, when rendered. */
  frame: HTMLIFrameElement | null = null;

  /** Launch token baked into the current iframe URL (for rotation watch). */
  private frameToken = "";
  private healTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: DshEmbedPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_DSH_EMBED;
  }

  getDisplayText(): string {
    return "DeepSeek Harness";
  }

  getIcon(): string {
    return "bot";
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  async render(): Promise<void> {
    this.stopHealWatch();
    const container = this.contentEl;
    container.empty();
    container.addClass("dsh-embed-view");

    const status = container.createDiv({ cls: "dsh-embed-status" });
    status.setText("Connecting to DSH…");

    const base = this.plugin.settings.serverUrl.trim() || "http://127.0.0.1:3080";
    const online = await this.probe(base);
    if (!online) {
      this.renderOffline(container, base);
      return;
    }

    // Resolve the launch token and verify the exact embed URL before showing
    // it: the bridge answers 200 for a valid `ob=1` token and 401 for a stale
    // one (the server rotates the token on every restart).
    let token = await this.plugin.resolveToken();
    let url = this.plugin.buildFrameUrl(token);
    if (!(await this.probeEmbed(url))) {
      // One retry with a fresh read — the log may have rotated just now.
      token = await this.plugin.resolveToken();
      url = this.plugin.buildFrameUrl(token);
      if (!(await this.probeEmbed(url))) {
        this.renderAuthError(container, base);
        return;
      }
    }

    container.removeChild(status);
    const frame = container.createEl("iframe", { cls: "dsh-embed-frame" });
    frame.setAttribute("src", url);
    frame.setAttribute("allow", "clipboard-read; clipboard-write");
    this.frame = frame;
    this.frameToken = token;
    this.plugin.registerFrame(this);
    this.startHealWatch();
  }

  /**
   * Self-heal after server restarts: the launch token rotates per process, so
   * a panel that stayed open across a restart holds a dead URL. Poll the log
   * and re-render when the token changed.
   */
  private startHealWatch(): void {
    this.stopHealWatch();
    this.healTimer = window.setInterval(() => void this.healCheck(), 20000);
    this.plugin.registerInterval(this.healTimer);
  }

  private stopHealWatch(): void {
    if (this.healTimer !== null) {
      window.clearInterval(this.healTimer);
      this.healTimer = null;
    }
  }

  private async healCheck(): Promise<void> {
    if (!this.frame || !this.frame.isConnected) {
      this.stopHealWatch();
      return;
    }
    const token = await this.plugin.resolveToken();
    if (!token || !this.frameToken || token === this.frameToken) return;
    new Notice("DSH 服务已重启，正在刷新面板…");
    await this.render();
  }

  /**
   * The exact embed URL: accepted tokens yield 200 (bridge serves directly)
   * or a 303 cookie-mint redirect; a stale token yields the 401 auth wall.
   */
  private async probeEmbed(url: string): Promise<boolean> {
    try {
      const res = await requestUrl({ url, method: "GET", throw: false });
      return res.status >= 200 && res.status < 400;
    } catch {
      return false;
    }
  }

  private renderAuthError(container: HTMLElement, base: string): void {
    const status = container.querySelector(".dsh-embed-status");
    if (status) container.removeChild(status as HTMLElement);
    const box = container.createDiv({ cls: "dsh-embed-offline" });
    box.createEl("p", { text: `DSH at ${base} rejected the launch token (401).` });
    box.createEl("p", {
      cls: "dsh-embed-hint",
      text: "The token rotates on every server restart. Check Settings → DeepSeek Harness (Embed) → Token log path, or paste the current 'dsh web' URL into Auth URL.",
    });
    const row = box.createDiv({ cls: "dsh-embed-actions" });
    const retry = row.createEl("button", { text: "Retry" });
    retry.addEventListener("click", () => void this.render());
  }

  private renderOffline(container: HTMLElement, base: string): void {
    const box = container.createDiv({ cls: "dsh-embed-offline" });
    box.createEl("p", { text: `DSH server is not reachable at ${base}.` });
    box.createEl("p", {
      cls: "dsh-embed-hint",
      text: "Start your harness (e.g. launchd service or `dsh web`), then retry.",
    });

    const row = box.createDiv({ cls: "dsh-embed-actions" });
    const retry = row.createEl("button", { text: "Retry" });
    retry.addEventListener("click", () => void this.render());

    const startCommand = this.plugin.settings.startCommand.trim();
    if (startCommand) {
      const start = row.createEl("button", { text: "Start service" });
      start.addEventListener("click", () => {
        void this.startService(startCommand);
      });
    }
  }

  private async probe(base: string): Promise<boolean> {
    try {
      const res = await requestUrl({ url: `${base.replace(/\/+$/, "")}/`, method: "GET", throw: false });
      return res.status < 500;
    } catch {
      return false;
    }
  }

  private async startService(command: string): Promise<void> {
    try {
      const req = (window as unknown as { require?: (id: string) => unknown }).require;
      if (!req) throw new Error("node require unavailable");
      const { exec } = req("child_process") as typeof import("child_process");
      exec(command, (error) => {
        if (error) new Notice(`DSH start failed: ${error.message}`);
      });
      new Notice("Starting DSH…");
      // Poll until the server answers, then reload the frame.
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (await this.probe(this.plugin.settings.serverUrl)) {
          await this.render();
          return;
        }
      }
      new Notice("DSH did not become ready in 30s — check its logs.");
    } catch (e) {
      new Notice(`DSH start failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async onClose(): Promise<void> {
    this.stopHealWatch();
    if (this.frame) this.plugin.unregisterFrame(this);
    this.frame = null;
    this.contentEl.empty();
  }
}
