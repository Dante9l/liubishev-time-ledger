import { App, ButtonComponent, Modal } from "obsidian";

interface ConfirmModalOptions {
  title: string;
  description: string;
  confirmText: string;
  cancelText: string;
}

export function openConfirmModal(app: App, options: ConfirmModalOptions): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmModal(app, options, resolve).open();
  });
}

class ConfirmModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly options: ConfirmModalOptions,
    private readonly resolve: (result: boolean) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-ledger-modal");

    contentEl.createEl("h2", { text: this.options.title });
    contentEl.createEl("p", { text: this.options.description });

    const footer = contentEl.createDiv({ cls: "time-ledger-modal-footer" });
    new ButtonComponent(footer)
      .setButtonText(this.options.cancelText)
      .onClick(() => this.finish(false));
    new ButtonComponent(footer)
      .setButtonText(this.options.confirmText)
      .setCta()
      .onClick(() => this.finish(true));
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.settled) {
      this.finish(false);
    }
  }

  private finish(result: boolean): void {
    if (this.settled) {
      return;
    }

    this.settled = true;
    this.resolve(result);
    this.close();
  }
}
