import { App, ButtonComponent, Modal, Notice } from "obsidian";
import type LiubishevTimeLedgerPlugin from "../main.js";

export class ReviewResultModal extends Modal {
  constructor(
    app: App,
    private readonly plugin: LiubishevTimeLedgerPlugin,
    private readonly title: string,
    private readonly content: string,
  ) {
    super(app);
  }

  onOpen(): void {
    const t = this.plugin.t.bind(this.plugin);
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-ledger-modal");
    contentEl.createEl("h2", { text: this.title });
    const preview = contentEl.createEl("pre", { cls: "time-ledger-review", text: this.content });
    preview.setAttribute("tabindex", "0");

    const footer = contentEl.createDiv({ cls: "time-ledger-modal-footer" });
    new ButtonComponent(footer)
      .setButtonText(t("reviewModal.copy"))
      .onClick(async () => {
        await navigator.clipboard.writeText(this.content);
        new Notice(t("notice.reviewCopied"));
      });
    new ButtonComponent(footer)
      .setButtonText(t("reviewModal.insertCurrentNote"))
      .setCta()
      .onClick(() => void this.plugin.insertOrExportMarkdown(this.title, this.content));
  }
}
