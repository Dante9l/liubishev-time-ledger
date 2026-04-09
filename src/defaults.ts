import { createTranslator, Locale } from "./i18n.js";
import { Category, PluginSettings, TimeLedgerData } from "./types.js";

export function createDefaultCategories(locale: Locale = "zh"): Category[] {
  const t = createTranslator(locale);
  return [
    { id: "study", name: t("defaults.category.study"), color: "#3b82f6", sortOrder: 1, enabled: true, isProductive: true },
    { id: "writing", name: t("defaults.category.writing"), color: "#8b5cf6", sortOrder: 2, enabled: true, isProductive: true },
    { id: "work", name: t("defaults.category.work"), color: "#0ea5e9", sortOrder: 3, enabled: true, isProductive: true },
    { id: "reading", name: t("defaults.category.reading"), color: "#10b981", sortOrder: 4, enabled: true, isProductive: true },
    { id: "chores", name: t("defaults.category.chores"), color: "#f59e0b", sortOrder: 5, enabled: true, isProductive: false },
    { id: "rest", name: t("defaults.category.rest"), color: "#94a3b8", sortOrder: 6, enabled: true, isProductive: false },
    { id: "exercise", name: t("defaults.category.exercise"), color: "#ef4444", sortOrder: 7, enabled: true, isProductive: true },
    { id: "social", name: t("defaults.category.social"), color: "#ec4899", sortOrder: 8, enabled: true, isProductive: false },
  ];
}

export function createDefaultSettings(locale: Locale = "zh"): PluginSettings {
  const t = createTranslator(locale);
  return {
    categories: createDefaultCategories(locale),
    maxRecentCategories: 4,
    autoFillFromLastEntry: true,
    defaultRangeMinutes: 30,
    exportFolder: "Time Ledger Exports",
    recentCategoryIds: [],
    dailyNote: {
      enabled: false,
      folder: "Daily",
      filenameFormat: "{{date}}",
      heading: t("defaults.dailyNoteHeading"),
      blockId: "liubishev-time-ledger",
    },
    smartCategory: {
      enabled: true,
      autoApplyHighConfidence: true,
      enableAISuggestions: true,
      applyAISuggestedTags: true,
    },
    ai: {
      enabled: false,
      baseUrl: "",
      apiKey: "",
      model: "",
      includeNotes: true,
      timeoutMs: 30000,
    },
  };
}

export const DEFAULT_CATEGORIES: Category[] = createDefaultCategories("zh");
export const DEFAULT_SETTINGS: PluginSettings = createDefaultSettings("zh");

export function createDefaultData(locale: Locale = "zh"): TimeLedgerData {
  return {
    version: 1,
    entries: [],
    settings: cloneSettings(createDefaultSettings(locale)),
  };
}

export function cloneSettings(settings: PluginSettings): PluginSettings {
  return {
    ...settings,
    categories: settings.categories.map((category) => ({ ...category })),
    recentCategoryIds: [...settings.recentCategoryIds],
    dailyNote: { ...settings.dailyNote },
    smartCategory: { ...settings.smartCategory },
    ai: { ...settings.ai },
  };
}
