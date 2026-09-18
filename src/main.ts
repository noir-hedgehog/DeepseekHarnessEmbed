import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from "obsidian";
import { DshEmbedView, VIEW_TYPE_DSH_EMBED } from "./view";
import { AnnotateModal, AnnotateAction } from "./annotate-modal";
import { InstallConsentModal } from "./install-modal";
import { SERVER_FILES, SERVER_PACKAGE_VERSION } from "./embedded-server-package";

export interface DshEmbedSettings {
  /** Base URL of the running DSH Web server (no trailing slash needed). */
  serverUrl: string;
  /**
   * DSH >= 0.1.2 protects the GUI with a browser-session cookie that is
   * structurally unusable inside Obsidian's cross-site iframe. Paste the full
   * launch URL (the one `dsh web` prints, containing `?token=...`).
   * When empty, the plugin tries tokenLogPath below.
   */
  authUrl: string;
  /**
   * The DSH launch token rotates on every server restart. When authUrl is
   * empty the plugin reads the freshest `dsh web: …?token=…` line from this
   * log file (the launchd stdout log of the local service).
   */
  tokenLogPath: string;
  /**
   * Optional shell command used by the panel's "Start service" button when
   * the server is offline (e.g. your start-harness.sh absolute path).
   */
  startCommand: string;
  /** DSH profile directory the server component installs into. */
  dshProfileDir: string;
  /** Last plugin version for which the install prompt was already shown. */
  installPromptedVersion: string;
}

const DEFAULT_SETTINGS: DshEmbedSettings = {
  serverUrl: "http://127.0.0.1:3080",
  authUrl: "",
  tokenLogPath: "/Users/uriah/Library/Application Support/DeepSeek-Harness/logs/launchd.out.log",
  startCommand: "",
  dshProfileDir: "~/.dsh/profiles/web",
  installPromptedVersion: "",
};

/**
 * Node's require, available in Obsidian's desktop renderer. A bundled dynamic
 * `import("fs/promises")` is NOT resolvable there (the specifier goes through
 * Chromium's ESM resolver, which knows no Node builtins) — node access goes
 * through this instead.
 */
function nodeRequire(): ((id: string) => unknown) | null {
  const req = (window as unknown as { require?: (id: string) => unknown }).require;
  return typeof req === "function" ? req : null;
}

/** Read only the log tail: 1MB easily covers the freshest `dsh web: …token=…` line. */
function readLogTail(path: string): string {
  const req = nodeRequire();
  if (!req) return "";
  const fs = req("fs") as typeof import("fs");
  const fd = fs.openSync(path, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - 1024 * 1024);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    return buf.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

/** One in-flight delivery waiting for the iframe bridge's ack. */
interface PendingDelivery {
  mode: AnnotateAction;
  timer: number;
}

export default class DshEmbedPlugin extends Plugin {
  settings: DshEmbedSettings = { ...DEFAULT_SETTINGS };

  private views = new Set<DshEmbedView>();
  private ready = false;
  private pending: PendingDelivery | null = null;
  private queuedText: { text: string; mode: AnnotateAction } | null = null;

  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    this.registerView(VIEW_TYPE_DSH_EMBED, (leaf) => new DshEmbedView(leaf, this));

    this.addRibbonIcon("bot", "DeepSeek Harness", () => {
      void this.activateView();
    });
    this.addCommand({
      id: "open-dsh-embed",
      name: "Open DeepSeek Harness panel",
      callback: () => void this.activateView(),
    });
    this.addCommand({
      id: "reload-dsh-embed",
      name: "Reload DeepSeek Harness panel",
      callback: () => this.reloadViews(),
    });

    // Editor selection → annotate → fill / send to the current session.
    this.addCommand({
      id: "dsh-send-selection",
      name: "Send selection to DeepSeek Harness…",
      editorCheckCallback: (checking, editor, view) => {
        const sel = editor.getSelection();
        if (!sel || !sel.trim()) return false;
        if (!checking) this.openAnnotate(editor, view);
        return true;
      },
    });
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        const sel = editor.getSelection();
        if (!sel || !sel.trim()) return;
        menu.addItem((item) => {
          item
            .setTitle("发送到 DeepSeek Harness…")
            .setIcon("bot")
            .onClick(() => this.openAnnotate(editor, view));
        });
      }),
    );

    // Messages coming back out of the iframe (bridge ready / delivery acks).
    window.addEventListener("message", (ev) => {
      const d = ev.data as { type?: string; mode?: string; ok?: boolean; reason?: string } | undefined;
      if (!d || typeof d !== "object") return;
      if (d.type === "dsh-ob-ready") {
        this.ready = true;
        const q = this.queuedText;
        this.queuedText = null;
        if (q) this.postToFrame(q.text, q.mode);
        return;
      }
      if (d.type === "dsh-ob-ack") {
        if (this.pending) {
          window.clearTimeout(this.pending.timer);
          this.pending = null;
        }
        if (d.ok) {
          new Notice(d.mode === "dsh-ob-send" ? "已发送到会话" : "已加入输入框");
        } else {
          new Notice(
            d.reason === "no-session"
              ? "面板里还没有打开的会话——请先在面板中打开或新建一个会话"
              : `发送失败：${d.reason ?? "unknown"}`,
          );
        }
      }
    });

    this.addSettingTab(new DshEmbedSettingTab(this.app, this));

    // Offer the server-component install once per plugin version.
    window.setTimeout(() => void this.maybeOfferInstall(), 2500);
  }

  // ---------------------------------------------------------------------
  // Server component (dsh-obsidian-embed) installation
  // ---------------------------------------------------------------------

  /** Resolved DSH profile dir (`~` expanded via Node's os.homedir). */
  profileDir(): string {
    const raw = this.settings.dshProfileDir.trim() || DEFAULT_SETTINGS.dshProfileDir;
    if (raw.startsWith("~")) {
      const req = nodeRequire();
      if (req) {
        const os = req("os") as typeof import("os");
        return raw.replace(/^~/, os.homedir());
      }
    }
    return raw;
  }

  private serverPaths() {
    const req = nodeRequire();
    const path = req ? (req("path") as typeof import("path")) : null;
    const profile = this.profileDir();
    const join = (...parts: string[]) => (path ? path.join(...parts) : parts.join("/"));
    return {
      profile,
      pkgDir: join(profile, "packages", "dsh-obsidian-embed"),
      nmLink: join(profile, "node_modules", "dsh-obsidian-embed"),
      patchFile: join(profile, "cordis.patch.yml"),
      join,
    };
  }

  /** What state the server component is in on this machine. */
  checkServerInstall(): { ok: boolean; detail: string } {
    const req = nodeRequire();
    if (!req) return { ok: false, detail: "node unavailable" };
    const fs = req("fs") as typeof import("fs");
    const { pkgDir, nmLink, patchFile, join } = this.serverPaths();
    try {
      const pkgJson = JSON.parse(fs.readFileSync(join(pkgDir, "package.json"), "utf8")) as { version?: string };
      const version = pkgJson.version ?? "?";
      const current = version === SERVER_PACKAGE_VERSION;
      const patch = fs.existsSync(patchFile) && fs.readFileSync(patchFile, "utf8").includes("dsh-obsidian-embed");
      const linked = fs.existsSync(nmLink);
      if (current && patch && linked) return { ok: true, detail: `v${version} 已安装` };
      const missing = [
        current ? null : `包版本 ${version} ≠ 内置 ${SERVER_PACKAGE_VERSION}`,
        patch ? null : "cordis.patch.yml 未挂载",
        linked ? null : "node_modules 软链缺失",
      ].filter(Boolean);
      return { ok: false, detail: missing.join("；") };
    } catch {
      return { ok: false, detail: "未安装" };
    }
  }

  /** Write the embedded server package into the DSH profile. Idempotent. */
  installServerComponent(): { ok: boolean; message: string } {
    const req = nodeRequire();
    if (!req) return { ok: false, message: "Node 接口不可用（需要桌面端 Obsidian）" };
    const fs = req("fs") as typeof import("fs");
    const { pkgDir, nmLink, patchFile, join } = this.serverPaths();
    try {
      for (const [rel, content] of Object.entries(SERVER_FILES)) {
        const target = join(pkgDir, rel);
        fs.mkdirSync(join(target, ".."), { recursive: true });
        fs.writeFileSync(target, content, "utf8");
      }
      // node_modules symlink so the profile can resolve the package name.
      try {
        const existing = fs.readlinkSync(nmLink);
        if (existing !== "../packages/dsh-obsidian-embed") {
          fs.rmSync(nmLink, { recursive: true, force: true });
          fs.symlinkSync("../packages/dsh-obsidian-embed", nmLink);
        }
      } catch {
        fs.mkdirSync(join(nmLink, ".."), { recursive: true });
        if (!fs.existsSync(nmLink)) fs.symlinkSync("../packages/dsh-obsidian-embed", nmLink);
      }
      // Composition row.
      if (!fs.existsSync(patchFile)) {
        fs.writeFileSync(
          patchFile,
          "# cordis.patch.yml — profile composition overlay\n\n- insert:\n    - id: dsh-obsidian-embed\n      name: dsh-obsidian-embed\n",
          "utf8",
        );
      } else if (!fs.readFileSync(patchFile, "utf8").includes("dsh-obsidian-embed")) {
        fs.appendFileSync(
          patchFile,
          "\n# dsh-obsidian-embed — Obsidian embed mode (installed by the dsh-embed Obsidian plugin).\n- insert:\n    - id: dsh-obsidian-embed\n      name: dsh-obsidian-embed\n",
          "utf8",
        );
      }
      return { ok: true, message: `已安装到 ${pkgDir}（v${SERVER_PACKAGE_VERSION}）。重启 DSH 服务后生效。` };
    } catch (e) {
      return { ok: false, message: `安装失败：${e instanceof Error ? e.message : String(e)}` };
    }
  }

  private async maybeOfferInstall(): Promise<void> {
    if (this.checkServerInstall().ok) return;
    if (this.settings.installPromptedVersion === this.manifest.version) return;
    this.settings.installPromptedVersion = this.manifest.version;
    await this.saveData(this.settings);
    new InstallConsentModal(this.app, this.serverPaths().profile, (install) => {
      if (!install) return;
      const res = this.installServerComponent();
      new Notice(res.message, 8000);
    }).open();
  }

  registerFrame(view: DshEmbedView): void {
    this.views.add(view);
    this.ready = false;
  }

  unregisterFrame(view: DshEmbedView): void {
    this.views.delete(view);
    if (this.views.size === 0) this.ready = false;
  }

  private activeFrame(): HTMLIFrameElement | null {
    for (const v of this.views) {
      if (v.frame && v.frame.isConnected) return v.frame;
    }
    return null;
  }

  // ---------------------------------------------------------------------
  // Selection → annotate → deliver
  // ---------------------------------------------------------------------

  private openAnnotate(editor: Editor, view: MarkdownView | unknown): void {
    const selection = editor.getSelection();
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    const file = this.app.workspace.getActiveFile();
    const relPath = file ? file.path : "（未命名）";
    new AnnotateModal(
      this.app,
      {
        relPath,
        fromLine: from.line + 1,
        toLine: to.line + 1,
        selection,
      },
      (text, action) => void this.deliver(text, action),
    ).open();
  }

  private async deliver(text: string, mode: AnnotateAction): Promise<void> {
    await this.activateView();
    const frame = this.activeFrame();
    if (!frame) {
      new Notice("DSH 面板尚未加载完成，请稍候再试");
      return;
    }
    if (this.ready) {
      this.postToFrame(text, mode);
    } else {
      // The bridge announces itself once the embed module has applied.
      this.queuedText = { text, mode };
      window.setTimeout(() => {
        if (this.queuedText) {
          // Bridge never appeared (old server / module disabled): send anyway.
          const q = this.queuedText;
          this.queuedText = null;
          this.postToFrame(q.text, q.mode);
        }
      }, 4000);
    }
  }

  private postToFrame(text: string, mode: AnnotateAction): void {
    const frame = this.activeFrame();
    if (!frame || !frame.contentWindow) {
      new Notice("DSH 面板尚未加载完成，请稍候再试");
      return;
    }
    const origin = new URL(this.settings.serverUrl.trim() || DEFAULT_SETTINGS.serverUrl).origin;
    frame.contentWindow.postMessage({ type: mode === "send" ? "dsh-ob-send" : "dsh-ob-fill", text }, origin);
    if (this.pending) window.clearTimeout(this.pending.timer);
    this.pending = {
      mode,
      timer: window.setTimeout(() => {
        this.pending = null;
        new Notice("未收到面板确认——请确认面板中的会话已打开");
      }, 6000),
    };
  }

  // ---------------------------------------------------------------------
  // URL construction & token discovery
  // ---------------------------------------------------------------------

  /** Absolute vault root — the workspace the agent works in. */
  vaultRoot(): string {
    const adapter = this.app.vault.adapter as { getBasePath?: () => string };
    try {
      return adapter.getBasePath?.() ?? "";
    } catch {
      return "";
    }
  }

  /**
   * The launch token rotates per server process. Prefer the manual setting;
   * otherwise read the freshest `dsh web: …?token=…` line from the service
   * log. Returns "" when no token is discoverable (pre-0.1.2 servers).
   */
  async resolveToken(): Promise<string> {
    const auth = this.settings.authUrl.trim();
    if (auth) {
      try {
        const token = new URL(auth).searchParams.get("token");
        if (token) return token;
      } catch {
        if (/^[\w-]{8,}$/.test(auth)) return auth;
      }
    }
    const logPath = this.settings.tokenLogPath.trim();
    if (!logPath) return "";
    try {
      const content = readLogTail(logPath);
      const matches = content.match(/token=([\w-]{20,})/g);
      if (matches && matches.length > 0) {
        return matches[matches.length - 1].slice("token=".length);
      }
    } catch {
      // log unreadable — fall through to tokenless
    }
    return "";
  }

  /** URL the iframe loads for a given launch token. */
  buildFrameUrl(token: string): string {
    const base = this.settings.serverUrl.trim().replace(/\/+$/, "") || DEFAULT_SETTINGS.serverUrl;
    const params = new URLSearchParams();
    params.set("ob", "1");
    const vault = this.vaultRoot();
    if (vault) {
      // base64url: immune to URL-layer path corruption (spaces, unicode, '+')
      // that otherwise turns a real vault path into an ENOENT on the host.
      params.set("obVaultB64", Buffer.from(vault, "utf8").toString("base64url"));
    }
    if (token) params.set("token", token);
    return `${base}/?${params.toString()}`;
  }

  /** Convenience: resolve the current token, then build the iframe URL. */
  async frameUrl(): Promise<string> {
    return this.buildFrameUrl(await this.resolveToken());
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    const rightSplit = (workspace as unknown as {
      rightSplit?: { collapsed?: boolean; expand?: () => void };
    }).rightSplit;
    if (rightSplit?.collapsed) rightSplit.expand?.();

    let leaf: WorkspaceLeaf | undefined = workspace.getLeavesOfType(VIEW_TYPE_DSH_EMBED)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? undefined;
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_DSH_EMBED, active: true });
    }
    if (leaf) workspace.revealLeaf(leaf);
  }

  reloadViews(): void {
    this.ready = false;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_DSH_EMBED)) {
      const view = leaf.view;
      if (view instanceof DshEmbedView) void view.render();
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.reloadViews();
  }
}

class DshEmbedSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: DshEmbedPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "DeepSeek Harness (Embed)" });

    // Server component status + installer
    const state = this.plugin.checkServerInstall();
    new Setting(containerEl)
      .setName("Server component (dsh-obsidian-embed)")
      .setDesc(state.ok ? `✅ ${state.detail}` : `⚠️ ${state.detail}`)
      .addButton((btn) =>
        btn
          .setButtonText(state.ok ? "重新安装 / 修复" : "安装")
          .onClick(() => {
            const res = this.plugin.installServerComponent();
            new Notice(res.message, 8000);
            this.display();
          }),
      );

    new Setting(containerEl)
      .setName("Server URL")
      .setDesc("Your running DSH Web server. The plugin embeds it; it never starts a second one.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.serverUrl)
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Auth URL or token (DSH ≥ 0.1.2)")
      .setDesc(
        "Usually leave empty: the token is auto-read from the service log below, and the panel self-heals after server restarts. Paste a launch URL here only to override.",
      )
      .addText((text) =>
        text
          .setPlaceholder("auto from log")
          .setValue(this.plugin.settings.authUrl)
          .onChange(async (value) => {
            this.plugin.settings.authUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Token log path")
      .setDesc(
        "launchd stdout log containing the 'dsh web: …?token=…' line; used to discover the current launch token.",
      )
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.tokenLogPath)
          .setValue(this.plugin.settings.tokenLogPath)
          .onChange(async (value) => {
            this.plugin.settings.tokenLogPath = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Start command (optional)")
      .setDesc(
        "Shell command for the panel's Start button when the server is offline, e.g. /Users/you/Library/Application Support/DeepSeek-Harness/start-harness.sh",
      )
      .addText((text) =>
        text
          .setPlaceholder("leave empty to disable auto-start")
          .setValue(this.plugin.settings.startCommand)
          .onChange(async (value) => {
            this.plugin.settings.startCommand = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("DSH profile directory")
      .setDesc("Where the server component installs. Default matches DSH_HOME's web profile.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.dshProfileDir)
          .setValue(this.plugin.settings.dshProfileDir)
          .onChange(async (value) => {
            this.plugin.settings.dshProfileDir = value.trim();
            await this.plugin.saveSettings();
          }),
      );
  }
}
