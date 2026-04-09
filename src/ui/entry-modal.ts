import { App, ButtonComponent, DropdownComponent, Modal, Notice, Setting } from "obsidian";
import type LiubishevTimeLedgerPlugin from "../main.js";
import { shiftDateKey, splitTagInput } from "../time.js";
import { CategorySuggestion, EntryDraft, EntryFormSeed } from "../types.js";

export class QuickEntryModal extends Modal {
  private dateInputEl!: HTMLInputElement;
  private timeInputEl!: HTMLInputElement;
  private categoryDropdown!: DropdownComponent;
  private tagsInputEl!: HTMLInputElement;
  private projectInputEl!: HTMLInputElement;
  private noteInputEl!: HTMLTextAreaElement;
  private previewEl!: HTMLDivElement;
  private suggestionEl!: HTMLDivElement;
  private aiSuggestionEl!: HTMLDivElement;
  private recentCategoriesEl!: HTMLDivElement;
  private categoryTouched = false;
  private currentSuggestion: CategorySuggestion | null = null;
  private aiSuggestion: CategorySuggestion | null = null;
  private aiReviewButton!: HTMLButtonElement;

  constructor(
    app: App,
    private readonly plugin: LiubishevTimeLedgerPlugin,
    private readonly seed: EntryFormSeed = {},
  ) {
    super(app);
  }

  onOpen(): void {
    const t = this.plugin.t.bind(this.plugin);
    const { contentEl } = this;
    const suggested = this.plugin.getSuggestedDraft(this.seed);
    const categories = this.plugin.getOrderedCategories();
    const selectedCategoryId = this.seed.categoryId ?? suggested.categoryId;

    contentEl.empty();
    contentEl.addClass("time-ledger-modal");
    contentEl.createEl("h2", { text: this.seed.id ? t("entryModal.title.edit") : t("entryModal.title.new") });

    const dateSetting = new Setting(contentEl).setName(t("entryModal.field.date"));
    this.dateInputEl = dateSetting.controlEl.createEl("input", { attr: { type: "date" } });
    this.dateInputEl.value = this.seed.date ?? suggested.date;
    this.dateInputEl.addEventListener("input", () => this.updatePreview());

    const timeSetting = new Setting(contentEl)
      .setName(t("entryModal.field.time"))
      .setDesc(t("entryModal.field.time.description"));
    this.timeInputEl = timeSetting.controlEl.createEl("input", { cls: "time-ledger-input" });
    this.timeInputEl.value = this.seed.timeInput ?? suggested.timeInput;
    this.timeInputEl.placeholder = t("entryModal.field.time.placeholder");
    this.timeInputEl.addEventListener("input", () => this.updatePreview());

    this.renderQuickActions(contentEl);

    new Setting(contentEl).setName(t("entryModal.field.category")).addDropdown((dropdown) => {
      this.categoryDropdown = dropdown;
      for (const category of categories) {
        dropdown.addOption(category.id, category.name);
      }
      dropdown.setValue(selectedCategoryId);
      dropdown.onChange(() => {
        this.categoryTouched = true;
        this.refreshSuggestion();
      });
    });

    this.recentCategoriesEl = contentEl.createDiv({ cls: "time-ledger-quick-categories" });
    this.renderRecentCategories();
    this.suggestionEl = contentEl.createDiv({ cls: "time-ledger-suggestion" });
    this.aiSuggestionEl = contentEl.createDiv({ cls: "time-ledger-suggestion" });

    const tagsSetting = new Setting(contentEl).setName(t("entryModal.field.tags"));
    this.tagsInputEl = tagsSetting.controlEl.createEl("input", { cls: "time-ledger-input" });
    this.tagsInputEl.placeholder = t("entryModal.field.tags.placeholder");
    this.tagsInputEl.value = (this.seed.tags ?? []).join(" ");
    this.tagsInputEl.addEventListener("input", () => this.handleSemanticInputChange());

    const projectSetting = new Setting(contentEl).setName(t("entryModal.field.project"));
    this.projectInputEl = projectSetting.controlEl.createEl("input", { cls: "time-ledger-input" });
    this.projectInputEl.value = this.seed.project ?? "";
    this.projectInputEl.addEventListener("input", () => this.handleSemanticInputChange());

    const noteSetting = new Setting(contentEl).setName(t("entryModal.field.note"));
    this.noteInputEl = noteSetting.controlEl.createEl("textarea", { cls: "time-ledger-textarea" });
    this.noteInputEl.rows = 4;
    this.noteInputEl.value = this.seed.note ?? "";
    this.noteInputEl.addEventListener("input", () => this.handleSemanticInputChange());

    this.previewEl = contentEl.createDiv({ cls: "time-ledger-preview" });
    this.updatePreview();
    this.refreshSuggestion();

    const footer = contentEl.createDiv({ cls: "time-ledger-modal-footer" });
    new ButtonComponent(footer).setButtonText(t("common.cancel")).onClick(() => this.close());
    new ButtonComponent(footer)
      .setButtonText(t("common.save"))
      .setCta()
      .onClick(() => void this.handleSave());

    contentEl.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void this.handleSave();
      }
    });

    window.setTimeout(() => {
      if (this.timeInputEl?.isConnected) {
        this.timeInputEl.focus();
        this.timeInputEl.select();
      }
    }, 30);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private updatePreview(): void {
    try {
      const preview = this.plugin.previewTimeInput(this.dateInputEl.value, this.timeInputEl.value, this.seed.id);
      this.previewEl.removeClass("is-error");
      this.previewEl.setText(this.plugin.t("entryModal.preview", { description: preview.description }));
    } catch (error) {
      this.previewEl.addClass("is-error");
      this.previewEl.setText(getErrorMessage(error, this.plugin));
    }
  }

  private refreshSuggestion(): void {
    const suggestion = this.plugin.getCategorySuggestion({
      project: this.projectInputEl?.value ?? "",
      note: this.noteInputEl?.value ?? "",
      tags: splitTagInput(this.tagsInputEl?.value ?? ""),
    }, this.seed.id);
    this.currentSuggestion = suggestion;
    this.suggestionEl.empty();

    if (!suggestion) {
      this.suggestionEl.setText(this.plugin.t("entryModal.localSuggestion.none"));
    } else {
      if (!this.categoryTouched && this.plugin.getSettings().smartCategory.autoApplyHighConfidence && suggestion.confidence === "high") {
        this.categoryDropdown.setValue(suggestion.categoryId);
      }

      const categoryName = this.plugin.getOrderedCategories().find((item) => item.id === suggestion.categoryId)?.name ?? suggestion.categoryId;
      this.suggestionEl.createSpan({
        text: this.plugin.t("entryModal.localSuggestion.withReason", {
          category: categoryName,
          reason: suggestion.reason,
        }),
      });
      const applyButton = this.suggestionEl.createEl("button", {
        text: this.plugin.t("common.applySuggestion"),
        cls: "mod-cta",
      });
      applyButton.addEventListener("click", () => {
        this.categoryDropdown.setValue(suggestion.categoryId);
        this.categoryTouched = true;
        this.renderAISuggestion();
      });
    }

    this.renderAISuggestion();
  }

  private async handleSave(): Promise<void> {
    try {
      await this.plugin.saveDraft(this.collectDraft());
      new Notice(this.seed.id ? this.plugin.t("notice.entryUpdated") : this.plugin.t("notice.entrySaved"));
      this.close();
    } catch (error) {
      new Notice(getErrorMessage(error, this.plugin));
    }
  }

  private collectDraft(): EntryDraft {
    return {
      id: this.seed.id,
      date: this.dateInputEl.value,
      timeInput: this.timeInputEl.value,
      categoryId: this.categoryDropdown.getValue(),
      tags: splitTagInput(this.tagsInputEl.value),
      project: this.projectInputEl.value,
      note: this.noteInputEl.value,
      source: this.seed.source ?? "manual",
    };
  }

  private renderQuickActions(container: HTMLElement): void {
    const row = container.createDiv({ cls: "time-ledger-quick-row" });
    this.createActionButton(row, this.plugin.t("common.today"), () => {
      this.dateInputEl.value = this.plugin.getTodayDateKey();
      this.syncTimeFromSuggestedDraft();
    });
    this.createActionButton(row, this.plugin.t("common.yesterday"), () => {
      this.dateInputEl.value = shiftDateKey(this.plugin.getTodayDateKey(), -1);
      this.syncTimeFromSuggestedDraft();
    });
    this.createActionButton(row, this.plugin.t("common.continueLast"), () => {
      const seed = this.plugin.getContinueSeed(this.dateInputEl.value || this.plugin.getTodayDateKey());
      this.applySeed(seed);
    });
  }

  private renderRecentCategories(): void {
    this.recentCategoriesEl.empty();
    const categories = this.plugin.getOrderedCategories().slice(0, this.plugin.getSettings().maxRecentCategories);
    if (!categories.length) {
      return;
    }

    this.recentCategoriesEl.createSpan({ text: this.plugin.t("entryModal.quickActions.recent") });
    for (const category of categories) {
      const button = this.recentCategoriesEl.createEl("button", { text: category.name });
      button.addEventListener("click", () => {
        this.categoryDropdown.setValue(category.id);
        this.categoryTouched = true;
        this.refreshSuggestion();
      });
    }
  }

  private applySeed(seed: EntryFormSeed): void {
    if (seed.date) {
      this.dateInputEl.value = seed.date;
    }
    if (seed.timeInput) {
      this.timeInputEl.value = seed.timeInput;
    }
    if (seed.categoryId) {
      this.categoryDropdown.setValue(seed.categoryId);
    }
    if (seed.tags) {
      this.tagsInputEl.value = seed.tags.join(" ");
    }
    if (typeof seed.project === "string") {
      this.projectInputEl.value = seed.project;
    }
    if (typeof seed.note === "string") {
      this.noteInputEl.value = seed.note;
    }
    this.updatePreview();
    this.aiSuggestion = null;
    this.refreshSuggestion();
  }

  private syncTimeFromSuggestedDraft(): void {
    const suggested = this.plugin.getSuggestedDraft({
      id: this.seed.id,
      date: this.dateInputEl.value,
      categoryId: this.categoryDropdown?.getValue(),
      tags: splitTagInput(this.tagsInputEl?.value ?? ""),
      project: this.projectInputEl?.value ?? "",
      note: this.noteInputEl?.value ?? "",
    });
    this.timeInputEl.value = suggested.timeInput;
    this.updatePreview();
    this.refreshSuggestion();
  }

  private renderAISuggestion(): void {
    this.aiSuggestionEl.empty();
    if (!this.plugin.canUseAICategorySuggestion()) {
      this.aiSuggestionEl.hide();
      return;
    }

    this.aiSuggestionEl.show();
    const suggestion = this.aiSuggestion;
    if (suggestion) {
      const categoryName = this.plugin.getOrderedCategories().find((item) => item.id === suggestion.categoryId)?.name ?? suggestion.categoryId;
      const tagsText = suggestion.tags.map((tag) => `#${tag}`).join(" ");
      this.aiSuggestionEl.createSpan({
        text: this.plugin.t("entryModal.aiSuggestion.withReason", {
          category: categoryName,
          tags: suggestion.tags.length
            ? this.plugin.t("entryModal.aiSuggestion.tagsPrefix", { tags: tagsText })
            : "",
          reason: suggestion.reason,
        }),
      });
    } else {
      const currentConfidence = this.currentSuggestion?.confidence ?? "low";
      const hint = currentConfidence === "high"
        ? this.plugin.t("entryModal.aiHint.high")
        : this.plugin.t("entryModal.aiHint.low");
      this.aiSuggestionEl.createSpan({ text: hint });
    }

    this.aiReviewButton = this.aiSuggestionEl.createEl("button", {
      text: suggestion ? this.plugin.t("common.action.aiReviewAgain") : this.plugin.t("common.action.aiReviewOnce"),
      cls: "mod-cta",
    });
    this.aiReviewButton.addEventListener("click", () => void this.handleAIReview());
  }

  private async handleAIReview(): Promise<void> {
    try {
      this.aiReviewButton.disabled = true;
      this.aiReviewButton.setText(this.plugin.t("common.status.processingAi"));
      const suggestion = await this.plugin.generateAICategorySuggestion({
        project: this.projectInputEl.value,
        note: this.noteInputEl.value,
        tags: splitTagInput(this.tagsInputEl.value),
      }, this.seed.id);
      this.aiSuggestion = suggestion;
      this.categoryDropdown.setValue(suggestion.categoryId);
      if (this.plugin.getSettings().smartCategory.applyAISuggestedTags && suggestion.tags.length) {
        this.tagsInputEl.value = Array.from(new Set([...splitTagInput(this.tagsInputEl.value), ...suggestion.tags])).join(" ");
      }
      this.categoryTouched = true;
      this.renderAISuggestion();
    } catch (error) {
      new Notice(getErrorMessage(error, this.plugin));
      this.renderAISuggestion();
    }
  }

  private handleSemanticInputChange(): void {
    this.aiSuggestion = null;
    this.refreshSuggestion();
  }

  private createActionButton(container: HTMLElement, text: string, handler: () => void): void {
    const button = container.createEl("button", { text });
    button.addEventListener("click", handler);
  }
}

function getErrorMessage(error: unknown, plugin: LiubishevTimeLedgerPlugin): string {
  return error instanceof Error ? error.message : plugin.t("error.operationFailed");
}
