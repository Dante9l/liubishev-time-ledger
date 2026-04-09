import { App, DropdownComponent, Notice, PluginSettingTab, Setting, TextComponent } from "obsidian";
import { listAIModels } from "./ai.js";
import type LiubishevTimeLedgerPlugin from "./main.js";
import { AISettings, Category, PluginSettings } from "./types.js";

export class TimeLedgerSettingTab extends PluginSettingTab {
  private modelInput: TextComponent | null = null;
  private modelDropdown: DropdownComponent | null = null;
  private modelSetting: Setting | null = null;
  private availableModels: string[] = [];
  private modelState: "idle" | "loading" | "ready" | "empty" | "error" = "idle";
  private modelError = "";
  private modelRequestId = 0;
  private modelRequestTimer: number | null = null;

  constructor(app: App, private readonly plugin: LiubishevTimeLedgerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    createHeading(containerEl, this.plugin.t("settings.title"));
    this.renderGeneralSettings(containerEl);
    this.renderDailyNoteSettings(containerEl);
    this.renderCategorySettings(containerEl);
    this.renderSmartCategorySettings(containerEl);
    this.renderAISettings(containerEl);
    this.scheduleModelRefresh(this.plugin.getSettings().ai, true);
  }

  private renderGeneralSettings(containerEl: HTMLElement): void {
    const t = this.plugin.t.bind(this.plugin);
    const settings = this.plugin.getSettings();
    createHeading(containerEl, t("settings.section.general"));

    new Setting(containerEl)
      .setName(t("settings.general.autoFill"))
      .addToggle((toggle) => toggle.setValue(settings.autoFillFromLastEntry).onChange((value) => {
        this.updateSettings((current) => ({ ...current, autoFillFromLastEntry: value }));
      }));

    new Setting(containerEl)
      .setName(t("settings.general.defaultRangeMinutes"))
      .setDesc(t("settings.general.defaultRangeMinutesDescription"))
      .addText((text) => text.setValue(`${settings.defaultRangeMinutes}`).onChange((value) => {
        const fallback = this.plugin.getSettings().defaultRangeMinutes;
        const minutes = Number(value || fallback);
        this.updateSettings((current) => ({ ...current, defaultRangeMinutes: Math.max(5, minutes) }));
      }));

    new Setting(containerEl)
      .setName(t("settings.general.maxRecentCategories"))
      .addText((text) => text.setValue(`${settings.maxRecentCategories}`).onChange((value) => {
        const fallback = this.plugin.getSettings().maxRecentCategories;
        const count = Number(value || fallback);
        this.updateSettings((current) => ({ ...current, maxRecentCategories: Math.max(1, count) }));
      }));

    new Setting(containerEl)
      .setName(t("settings.general.exportFolder"))
      .setDesc(t("settings.general.exportFolderDescription"))
      .addText((text) => text.setValue(settings.exportFolder).onChange((value) => {
        this.updateSettings((current) => ({ ...current, exportFolder: value.trim() || "Time Ledger Exports" }));
      }));
  }

  private renderCategorySettings(containerEl: HTMLElement): void {
    const settings = this.plugin.getSettings();
    const t = this.plugin.t.bind(this.plugin);
    createHeading(containerEl, t("settings.section.category"));

    for (const category of [...settings.categories].sort((left, right) => left.sortOrder - right.sortOrder)) {
      new Setting(containerEl)
        .setName(category.name)
        .setDesc(t("settings.category.itemDescription"))
        .addText((text) => text.setPlaceholder(t("settings.category.namePlaceholder")).setValue(category.name).onChange((value) => {
          this.runAsync(() => this.patchCategory(category.id, { name: value.trim() || category.name }));
        }))
        .addText((text) => {
          text.inputEl.type = "color";
          text.setValue(normalizeColor(category.color));
          text.onChange((value) => {
            this.runAsync(() => this.patchCategory(category.id, { color: value || category.color }));
          });
        })
        .addToggle((toggle) => toggle.setTooltip(t("settings.category.productiveTooltip")).setValue(category.isProductive).onChange((value) => {
          this.runAsync(() => this.patchCategory(category.id, { isProductive: value }));
        }))
        .addToggle((toggle) => toggle.setTooltip(t("settings.category.enabledTooltip")).setValue(category.enabled).onChange((value) => {
          this.runAsync(() => this.patchCategory(category.id, { enabled: value }));
        }))
        .addExtraButton((button) => button
          .setIcon("trash")
          .setTooltip(t("settings.category.deleteTooltip"))
          .onClick(() => {
            this.runAsync(async () => {
              const current = this.plugin.getSettings();
              if (current.categories.length <= 1) {
                new Notice(t("error.keepAtLeastOneCategory"));
                return;
              }

              const nextCategories = current.categories.filter((item) => item.id !== category.id);
              await this.saveSettings({ ...current, categories: nextCategories });
              this.display();
            });
          }));
    }

    new Setting(containerEl)
      .setName(t("settings.category.add"))
      .addButton((button) => button.setButtonText(t("settings.category.addButton")).setCta().onClick(() => {
        this.runAsync(async () => {
          const current = this.plugin.getSettings();
          const nextCategory = createCategory(current.categories.length + 1, this.plugin);
          await this.saveSettings({ ...current, categories: [...current.categories, nextCategory] });
          this.display();
        });
      }));
  }

  private renderDailyNoteSettings(containerEl: HTMLElement): void {
    const settings = this.plugin.getSettings();
    const t = this.plugin.t.bind(this.plugin);
    createHeading(containerEl, t("settings.section.dailyNote"));

    new Setting(containerEl)
      .setName(t("settings.dailyNote.enable"))
      .setDesc(t("settings.dailyNote.enableDescription"))
      .addToggle((toggle) => toggle.setValue(settings.dailyNote.enabled).onChange((value) => {
        this.updateSettings((current) => ({ ...current, dailyNote: { ...current.dailyNote, enabled: value } }));
      }));

    new Setting(containerEl)
      .setName(t("settings.dailyNote.folder"))
      .setDesc(t("settings.dailyNote.folderDescription"))
      .addText((text) => text.setValue(settings.dailyNote.folder).onChange((value) => {
        this.updateSettings((current) => ({ ...current, dailyNote: { ...current.dailyNote, folder: value.trim() || "Daily" } }));
      }));

    new Setting(containerEl)
      .setName(t("settings.dailyNote.filenameTemplate"))
      .setDesc(t("settings.dailyNote.filenameTemplateDescription"))
      .addText((text) => text.setValue(settings.dailyNote.filenameFormat).onChange((value) => {
        this.updateSettings((current) => ({
          ...current,
          dailyNote: { ...current.dailyNote, filenameFormat: value.trim() || "{{date}}" },
        }));
      }));

    new Setting(containerEl)
      .setName(t("settings.dailyNote.heading"))
      .addText((text) => text.setValue(settings.dailyNote.heading).onChange((value) => {
        this.updateSettings((current) => ({
          ...current,
          dailyNote: { ...current.dailyNote, heading: value.trim() || t("defaults.dailyNoteHeading") },
        }));
      }));

    new Setting(containerEl)
      .setName(t("settings.dailyNote.blockId"))
      .setDesc(t("settings.dailyNote.blockIdDescription"))
      .addText((text) => text.setValue(settings.dailyNote.blockId).onChange((value) => {
        this.updateSettings((current) => ({
          ...current,
          dailyNote: { ...current.dailyNote, blockId: value.trim() || "liubishev-time-ledger" },
        }));
      }));

    new Setting(containerEl)
      .setName(t("settings.dailyNote.syncToday"))
      .addButton((button) => button.setButtonText(t("settings.dailyNote.syncButton")).setCta().onClick(() => {
        this.runAsync(async () => {
          await this.plugin.syncDailyNotesForDates([this.plugin.getTodayDateKey()]);
          new Notice(t("notice.dailyNoteSyncedToday"));
        });
      }));
  }

  private renderSmartCategorySettings(containerEl: HTMLElement): void {
    const settings = this.plugin.getSettings();
    const t = this.plugin.t.bind(this.plugin);
    createHeading(containerEl, t("settings.section.smartCategory"));

    new Setting(containerEl)
      .setName(t("settings.smart.enable"))
      .setDesc(t("settings.smart.enableDescription"))
      .addToggle((toggle) => toggle.setValue(settings.smartCategory.enabled).onChange((value) => {
        this.updateSettings((current) => ({ ...current, smartCategory: { ...current.smartCategory, enabled: value } }));
      }));

    new Setting(containerEl)
      .setName(t("settings.smart.autoApplyHigh"))
      .setDesc(t("settings.smart.autoApplyHighDescription"))
      .addToggle((toggle) => toggle.setValue(settings.smartCategory.autoApplyHighConfidence).onChange((value) => {
        this.updateSettings((current) => ({
          ...current,
          smartCategory: { ...current.smartCategory, autoApplyHighConfidence: value },
        }));
      }));

    new Setting(containerEl)
      .setName(t("settings.smart.enableAi"))
      .setDesc(t("settings.smart.enableAiDescription"))
      .addToggle((toggle) => toggle.setValue(settings.smartCategory.enableAISuggestions).onChange((value) => {
        this.updateSettings((current) => ({
          ...current,
          smartCategory: { ...current.smartCategory, enableAISuggestions: value },
        }));
      }));

    new Setting(containerEl)
      .setName(t("settings.smart.autoApplyTags"))
      .setDesc(t("settings.smart.autoApplyTagsDescription"))
      .addToggle((toggle) => toggle.setValue(settings.smartCategory.applyAISuggestedTags).onChange((value) => {
        this.updateSettings((current) => ({
          ...current,
          smartCategory: { ...current.smartCategory, applyAISuggestedTags: value },
        }));
      }));
  }

  private renderAISettings(containerEl: HTMLElement): void {
    const settings = this.plugin.getSettings();
    const t = this.plugin.t.bind(this.plugin);
    createHeading(containerEl, t("settings.section.ai"));

    new Setting(containerEl)
      .setName(t("settings.ai.enable"))
      .addToggle((toggle) => toggle.setValue(settings.ai.enabled).onChange((value) => {
        this.updateSettings((current) => ({ ...current, ai: { ...current.ai, enabled: value } }));
      }));

    new Setting(containerEl)
      .setName("Base URL")
      .setDesc(t("settings.ai.baseUrlDescription"))
      .addText((text) => text.setValue(settings.ai.baseUrl).onChange((value) => {
        this.updateAiSettings({ baseUrl: value.trim() }, true);
      }));

    new Setting(containerEl)
      .setName("API key")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(settings.ai.apiKey);
        text.onChange((value) => {
          this.updateAiSettings({ apiKey: value.trim() }, true);
        });
      });

    new Setting(containerEl)
      .setName("Model")
      .addText((text) => {
        this.modelInput = text;
        text.setValue(settings.ai.model);
        text.onChange((value) => {
          this.updateAiSettings({ model: value.trim() });
        });
      });

    this.modelSetting = new Setting(containerEl)
      .setName(t("settings.ai.availableModels"))
      .setDesc(t("settings.ai.availableModelsIdle"))
      .addDropdown((dropdown) => {
        this.modelDropdown = dropdown;
        dropdown.onChange((value) => {
          if (!value) {
            return;
          }

          this.modelInput?.setValue(value);
          this.updateAiSettings({ model: value });
        });
      });
    this.syncModelSetting(settings.ai.model);

    new Setting(containerEl)
      .setName(t("settings.ai.includeNotes"))
      .setDesc(t("settings.ai.includeNotesDescription"))
      .addToggle((toggle) => toggle.setValue(settings.ai.includeNotes).onChange((value) => {
        this.updateAiSettings({ includeNotes: value });
      }));
  }

  private async saveSettings(settings: PluginSettings): Promise<void> {
    await this.plugin.saveSettings(settings);
  }

  private async patchCategory(categoryId: string, patch: Partial<Category>): Promise<void> {
    const settings = this.plugin.getSettings();
    const categories = settings.categories.map((category) => (
      category.id === categoryId ? { ...category, ...patch } : category
    ));
    await this.saveSettings({ ...settings, categories });
  }

  private updateSettings(updater: (current: PluginSettings) => PluginSettings): void {
    this.runAsync(() => this.saveSettings(updater(this.plugin.getSettings())));
  }

  private updateAiSettings(patch: Partial<AISettings>, refreshModels = false): void {
    const current = this.plugin.getSettings();
    const nextAi = { ...current.ai, ...patch };
    const nextSettings = { ...current, ai: nextAi };
    this.runAsync(() => this.saveSettings(nextSettings));
    if (refreshModels) {
      this.scheduleModelRefresh(nextAi);
    }
  }

  private runAsync(task: () => Promise<void>): void {
    void task().catch((error) => {
      new Notice(getErrorMessage(error, this.plugin));
    });
  }

  private scheduleModelRefresh(aiSettings: AISettings, immediate = false): void {
    if (this.modelRequestTimer !== null) {
      window.clearTimeout(this.modelRequestTimer);
      this.modelRequestTimer = null;
    }

    if (!aiSettings.baseUrl.trim() || !aiSettings.apiKey.trim()) {
      this.availableModels = [];
      this.modelState = "idle";
      this.modelError = "";
      this.syncModelSetting(aiSettings.model);
      return;
    }

    this.modelState = "loading";
    this.modelError = "";
    this.syncModelSetting(aiSettings.model);

    const requestId = ++this.modelRequestId;
    const run = () => {
      void this.loadModels(aiSettings, requestId);
    };

    if (immediate) {
      run();
      return;
    }

    this.modelRequestTimer = window.setTimeout(() => {
      this.modelRequestTimer = null;
      run();
    }, 400);
  }

  private async loadModels(aiSettings: AISettings, requestId: number): Promise<void> {
    try {
      const models = await listAIModels(aiSettings);
      if (requestId !== this.modelRequestId) {
        return;
      }

      this.availableModels = models;
      this.modelState = models.length ? "ready" : "empty";
      this.modelError = "";
      this.syncModelSetting(this.modelInput?.getValue() ?? aiSettings.model);
    } catch (error) {
      if (requestId !== this.modelRequestId) {
        return;
      }

      this.availableModels = [];
      this.modelState = "error";
      this.modelError = getErrorMessage(error, this.plugin);
      this.syncModelSetting(this.modelInput?.getValue() ?? aiSettings.model);
    }
  }

  private syncModelSetting(selectedModel: string): void {
    if (!this.modelDropdown || !this.modelSetting) {
      return;
    }

    this.modelDropdown.selectEl.replaceChildren();
    this.modelDropdown.addOption("", this.plugin.t("settings.ai.availableModelsPlaceholder"));
    for (const model of this.availableModels) {
      this.modelDropdown.addOption(model, model);
    }

    if (selectedModel && this.availableModels.includes(selectedModel)) {
      this.modelDropdown.setValue(selectedModel);
    } else {
      this.modelDropdown.setValue("");
    }

    switch (this.modelState) {
      case "loading":
        this.modelSetting.setDesc(this.plugin.t("settings.ai.availableModelsLoading"));
        break;
      case "ready":
        this.modelSetting.setDesc(this.plugin.t("settings.ai.availableModelsReady", { count: this.availableModels.length }));
        break;
      case "empty":
        this.modelSetting.setDesc(this.plugin.t("settings.ai.availableModelsEmpty"));
        break;
      case "error":
        this.modelSetting.setDesc(this.plugin.t("settings.ai.availableModelsError", { message: this.modelError }));
        break;
      default:
        this.modelSetting.setDesc(this.plugin.t("settings.ai.availableModelsIdle"));
        break;
    }
  }
}

function createCategory(index: number, plugin: LiubishevTimeLedgerPlugin): Category {
  return {
    id: `category-${Date.now()}`,
    name: plugin.t("defaults.newCategoryName", { index }),
    color: "#64748b",
    sortOrder: index,
    enabled: true,
    isProductive: true,
  };
}

function normalizeColor(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#64748b";
}

function createHeading(containerEl: HTMLElement, text: string): void {
  new Setting(containerEl).setName(text).setHeading();
}

function getErrorMessage(error: unknown, plugin: LiubishevTimeLedgerPlugin): string {
  return error instanceof Error ? error.message : plugin.t("error.operationFailed");
}
