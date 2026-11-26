import { App, Modal } from "obsidian";

/**
 * First-run consent for installing the DSH-side companion package. The plugin
 * writes into the DSH profile (~/.dsh/profiles/web), i.e. OUTSIDE the vault —
 * Obsidian review and user trust both demand an explicit opt-in here.
 */
export class InstallConsentModal extends Modal {
  constructor(
    app: App,
    private profileDir: string,
    private onDecision: (install: boolean) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("dsh-embed-annotate");
    contentEl.createEl("h3", { text: "安装 DSH 服务端组件" });
    contentEl.createEl("p", {
      text: "本插件把 DSH Web GUI 嵌入侧边栏。隐藏侧栏、顶栏切换器、嵌入认证等定制由一个小型服务端组件（dsh-obsidian-embed）提供。该组件已打包在本插件内（不会联网下载任何内容），需要写入 DSH 的 profile 目录：",
    });
    contentEl.createEl("pre", {
      cls: "dsh-embed-annotate-quote",
      text: `${this.profileDir}/packages/dsh-obsidian-embed/\n${this.profileDir}/cordis.patch.yml（追加一行挂载）`,
    });
    contentEl.createEl("p", {
      cls: "dsh-embed-hint",
      text: "只写这两个位置，且只在你点「安装」后写入；安装后需要重启一次 DSH 服务生效。也可以在设置页随时安装/修复。",
    });

    const row = contentEl.createDiv({ cls: "dsh-embed-annotate-actions" });
    const later = row.createEl("button", { text: "以后再说" });
    later.addEventListener("click", () => {
      this.close();
      this.onDecision(false);
    });
    const ok = row.createEl("button", { text: "安装", cls: "mod-cta" });
    ok.addEventListener("click", () => {
      this.close();
      this.onDecision(true);
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
