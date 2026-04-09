import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type LiubishevTimeLedgerPlugin from "./main.js";
import { Category, PluginSettings } from "./types.js";

export class TimeLedgerSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: LiubishevTimeLedgerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const t = this.plugin.t.bind(this.plugin);
    containerEl.empty();
    containerEl.createEl("h2", { text: t("settings.title") });
    this.renderGeneralSettings(containerEl);
    this.renderDailyNoteSettings(containerEl);
    this.renderCategorySettings(containerEl);
    this.renderSmartCategorySettings(containerEl);
    this.renderAISettings(containerEl);
  }

  private renderGeneralSettings(containerEl: HTMLElement): void {
    const settings = this.plugin.getSettings();
    const t = this.plugin.t.bind(this.plugin);
    containerEl.createEl("h3", { text: t("settings.section.general") });

    new Setting(containerEl)
      .setName(t("settings.general.autoFill"))
      .addToggle((toggle) => toggle.setValue(settings.autoFillFromLastEntry).onChange(async (value) => {
        await this.saveSettings({ ...settings, autoFillFromLastEntry: value });
      }));

    new Setting(containerEl)
      .setName(t("settings.general.defaultRangeMinutes"))
      .setDesc(t("settings.general.defaultRangeMinutesDescription"))
      .addText((text) => text.setValue(`${settings.defaultRangeMinutes}`).onChange(async (value) => {
        const minutes = Number(value || settings.defaultRangeMinutes);
        await this.saveSettings({ ...settings, defaultRangeMinutes: Math.max(5, minutes) });
      }));

    new Setting(containerEl)
      .setName(t("settings.general.maxRecentCategories"))
      .addText((text) => text.setValue(`${settings.maxRecentCategories}`).onChange(async (value) => {
        const count = Number(value || settings.maxRecentCategories);
        await this.saveSettings({ ...settings, maxRecentCategories: Math.max(1, count) });
      }));

    new Setting(containerEl)
      .setName(t("settings.general.exportFolder"))
      .setDesc(t("settings.general.exportFolderDescription"))
      .addText((text) => text.setValue(settings.exportFolder).onChange(async (value) => {
        await this.saveSettings({ ...settings, exportFolder: value.trim() || "Time Ledger Exports" });
      }));
  }

  private renderCategorySettings(containerEl: HTMLElement): void {
    const settings = this.plugin.getSettings();
    const t = this.plugin.t.bind(this.plugin);
    containerEl.createEl("h3", { text: t("settings.section.category") });

    for (const category of [...settings.categories].sort((left, right) => left.sortOrder - right.sortOrder)) {
      new Setting(containerEl)
        .setName(category.name)
        .setDesc(t("settings.category.itemDescription"))
        .addText((text) => text.setPlaceholder(t("settings.category.namePlaceholder")).setValue(category.name).onChange(async (value) => {
          await this.patchCategory(category.id, { name: value.trim() || category.name });
        }))
        .addText((text) => {
          text.inputEl.type = "color";
          text.setValue(normalizeColor(category.color));
          text.onChange(async (value) => {
            await this.patchCategory(category.id, { color: value || category.color });
          });
        })
        .addToggle((toggle) => toggle.setTooltip(t("settings.category.productiveTooltip")).setValue(category.isProductive).onChange(async (value) => {
          await this.patchCategory(category.id, { isProductive: value });
        }))
        .addToggle((toggle) => toggle.setTooltip(t("settings.category.enabledTooltip")).setValue(category.enabled).onChange(async (value) => {
          await this.patchCategory(category.id, { enabled: value });
        }))
        .addExtraButton((button) => button
          .setIcon("trash")
          .setTooltip(t("settings.category.deleteTooltip"))
          .onClick(async () => {
            if (settings.categories.length <= 1) {
              new Notice(t("error.keepAtLeastOneCategory"));
              return;
            }

            const nextCategories = settings.categories.filter((item) => item.id !== category.id);
            await this.saveSettings({ ...settings, categories: nextCategories });
            this.display();
          }));
    }

    new Setting(containerEl)
      .setName(t("settings.category.add"))
      .addButton((button) => button.setButtonText(t("settings.category.addButton")).setCta().onClick(async () => {
        const nextCategory = createCategory(settings.categories.length + 1, this.plugin);
        await this.saveSettings({ ...settings, categories: [...settings.categories, nextCategory] });
        this.display();
      }));
  }

  private renderDailyNoteSettings(containerEl: HTMLElement): void {
    const settings = this.plugin.getSettings();
    const t = this.plugin.t.bind(this.plugin);
    containerEl.createEl("h3", { text: t("settings.section.dailyNote") });

    new Setting(containerEl)
      .setName(t("settings.dailyNote.enable"))
      .setDesc(t("settings.dailyNote.enableDescription"))
      .addToggle((toggle) => toggle.setValue(settings.dailyNote.enabled).onChange(async (value) => {
        await this.saveSettings({ ...settings, dailyNote: { ...settings.dailyNote, enabled: value } });
      }));

    new Setting(containerEl)
      .setName(t("settings.dailyNote.folder"))
      .setDesc(t("settings.dailyNote.folderDescription"))
      .addText((text) => text.setValue(settings.dailyNote.folder).onChange(async (value) => {
        await this.saveSettings({ ...settings, dailyNote: { ...settings.dailyNote, folder: value.trim() || "Daily" } });
      }));

    new Setting(containerEl)
      .setName(t("settings.dailyNote.filenameTemplate"))
      .setDesc(t("settings.dailyNote.filenameTemplateDescription"))
      .addText((text) => text.setValue(settings.dailyNote.filenameFormat).onChange(async (value) => {
        await this.saveSettings({ ...settings, dailyNote: { ...settings.dailyNote, filenameFormat: value.trim() || "{{date}}" } });
      }));

    new Setting(containerEl)
      .setName(t("settings.dailyNote.heading"))
      .addText((text) => text.setValue(settings.dailyNote.heading).onChange(async (value) => {
        await this.saveSettings({ ...settings, dailyNote: { ...settings.dailyNote, heading: value.trim() || t("defaults.dailyNoteHeading") } });
      }));

    new Setting(containerEl)
      .setName(t("settings.dailyNote.blockId"))
      .setDesc(t("settings.dailyNote.blockIdDescription"))
      .addText((text) => text.setValue(settings.dailyNote.blockId).onChange(async (value) => {
        await this.saveSettings({ ...settings, dailyNote: { ...settings.dailyNote, blockId: value.trim() || "liubishev-time-ledger" } });
      }));

    new Setting(containerEl)
      .setName(t("settings.dailyNote.syncToday"))
      .addButton((button) => button.setButtonText(t("settings.dailyNote.syncButton")).setCta().onClick(async () => {
        await this.plugin.syncDailyNotesForDates([this.plugin.getTodayDateKey()]);
        new Notice(t("notice.dailyNoteSyncedToday"));
      }));
  }

  private renderSmartCategorySettings(containerEl: HTMLElement): void {
    const settings = this.plugin.getSettings();
    const t = this.plugin.t.bind(this.plugin);
    containerEl.createEl("h3", { text: t("settings.section.smartCategory") });

    new Setting(containerEl)
      .setName(t("settings.smart.enable"))
      .setDesc(t("settings.smart.enableDescription"))
      .addToggle((toggle) => toggle.setValue(settings.smartCategory.enabled).onChange(async (value) => {
        await this.saveSettings({ ...settings, smartCategory: { ...settings.smartCategory, enabled: value } });
      }));

    new Setting(containerEl)
      .setName(t("settings.smart.autoApplyHigh"))
      .setDesc(t("settings.smart.autoApplyHighDescription"))
      .addToggle((toggle) => toggle.setValue(settings.smartCategory.autoApplyHighConfidence).onChange(async (value) => {
        await this.saveSettings({ ...settings, smartCategory: { ...settings.smartCategory, autoApplyHighConfidence: value } });
      }));

    new Setting(containerEl)
      .setName(t("settings.smart.enableAi"))
      .setDesc(t("settings.smart.enableAiDescription"))
      .addToggle((toggle) => toggle.setValue(settings.smartCategory.enableAISuggestions).onChange(async (value) => {
        await this.saveSettings({ ...settings, smartCategory: { ...settings.smartCategory, enableAISuggestions: value } });
      }));

    new Setting(containerEl)
      .setName(t("settings.smart.autoApplyTags"))
      .setDesc(t("settings.smart.autoApplyTagsDescription"))
      .addToggle((toggle) => toggle.setValue(settings.smartCategory.applyAISuggestedTags).onChange(async (value) => {
        await this.saveSettings({ ...settings, smartCategory: { ...settings.smartCategory, applyAISuggestedTags: value } });
      }));
  }

  private renderAISettings(containerEl: HTMLElement): void {
    const settings = this.plugin.getSettings();
    const t = this.plugin.t.bind(this.plugin);
    containerEl.createEl("h3", { text: t("settings.section.ai") });

    new Setting(containerEl)
      .setName(t("settings.ai.enable"))
      .addToggle((toggle) => toggle.setValue(settings.ai.enabled).onChange(async (value) => {
        await this.saveSettings({ ...settings, ai: { ...settings.ai, enabled: value } });
      }));

    new Setting(containerEl)
      .setName("Base URL")
      .setDesc(t("settings.ai.baseUrlDescription"))
      .addText((text) => text.setValue(settings.ai.baseUrl).onChange(async (value) => {
        await this.saveSettings({ ...settings, ai: { ...settings.ai, baseUrl: value.trim() } });
      }));

    new Setting(containerEl)
      .setName("API Key")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(settings.ai.apiKey);
        text.onChange(async (value) => {
          await this.saveSettings({ ...settings, ai: { ...settings.ai, apiKey: value.trim() } });
        });
      });

    new Setting(containerEl)
      .setName("Model")
      .addText((text) => text.setValue(settings.ai.model).onChange(async (value) => {
        await this.saveSettings({ ...settings, ai: { ...settings.ai, model: value.trim() } });
      }));

    new Setting(containerEl)
      .setName(t("settings.ai.includeNotes"))
      .setDesc(t("settings.ai.includeNotesDescription"))
      .addToggle((toggle) => toggle.setValue(settings.ai.includeNotes).onChange(async (value) => {
        await this.saveSettings({ ...settings, ai: { ...settings.ai, includeNotes: value } });
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
