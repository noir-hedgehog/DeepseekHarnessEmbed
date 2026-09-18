import { App, Modal, Notice } from "obsidian";

export interface AnnotatePayload {
  /** Vault-relative path of the source note. */
  relPath: string;
  /** 1-based inclusive line range of the selection. */
  fromLine: number;
  toLine: number;
  /** The selected text itself. */
  selection: string;
}

export type AnnotateAction = "fill" | "send";

/**
 * Quote-and-annotate modal: shows the selection with its source location,
 * collects an optional annotation, then hands the composed text to the
 * caller for delivery into the DSH session (fill composer or send directly).
 */
export class AnnotateModal extends Modal {
  private annotation = "";

  constructor(
    app: App,
    private payload: AnnotatePayload,
    private onDone: (text: string, action: AnnotateAction) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("dsh-embed-annotate");
    const { relPath, fromLine, toLine, selection } = this.payload;

    contentEl.createEl("h3", { text: "发送到 DeepSeek Harness" });
    contentEl.createEl("div", {
      cls: "dsh-embed-annotate-src",
      text: `${relPath} · 第 ${fromLine}–${toLine} 行`,
    });

    const quote = contentEl.createEl("pre", { cls: "dsh-embed-annotate-quote" });
    quote.setText(selection.length > 800 ? selection.slice(0, 800) + "\n…" : selection);

    const ta = contentEl.createEl("textarea", {
      cls: "dsh-embed-annotate-input",
      placeholder: "批注（可选）— 说明这段文字要做什么",
    });
    ta.rows = 4;
    ta.addEventListener("input", () => {
      this.annotation = ta.value;
    });
    // Focus the annotation box immediately; Cmd/Ctrl+Enter sends.
    window.setTimeout(() => ta.focus(), 0);
    ta.addEventListener("keydown", (ev) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
        ev.preventDefault();
        this.finish("send");
      }
    });

    const row = contentEl.createDiv({ cls: "dsh-embed-annotate-actions" });
    const fillBtn = row.createEl("button", { text: "加入输入框" });
    fillBtn.addEventListener("click", () => this.finish("fill"));
    const sendBtn = row.createEl("button", { text: "直接发送 (⌘⏎)", cls: "mod-cta" });
    sendBtn.addEventListener("click", () => this.finish("send"));
  }

  private compose(): string {
    const { relPath, fromLine, toLine, selection } = this.payload;
    const quoted = selection
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    let text = `引用自 ${relPath}（第 ${fromLine}–${toLine} 行）：\n${quoted}`;
    const note = this.annotation.trim();
    if (note) text += `\n\n批注：${note}`;
    return text;
  }

  private finish(action: AnnotateAction): void {
    const text = this.compose();
    if (!text.trim()) {
      new Notice("没有可发送的内容");
      return;
    }
    this.close();
    this.onDone(text, action);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
