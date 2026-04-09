import { Plugin, getLanguage } from "obsidian";
import { createDefaultData } from "./defaults.js";
import { createTranslator, resolveLocale } from "./i18n.js";
import { sortEntries } from "./time.js";
import { Category, PluginSettings, TimeEntry, TimeInputStyle, TimeLedgerData } from "./types.js";

export class TimeLedgerStore {
  private data: TimeLedgerData = createDefaultData(getCurrentLocale());

  constructor(private readonly plugin: Plugin) {}

  async load(): Promise<void> {
    const loaded = await this.plugin.loadData();
    this.data = mergeData(loaded, getCurrentLocale());
  }

  getSettings(): PluginSettings {
    return cloneSettings(this.data.settings);
  }

  getEntries(): TimeEntry[] {
    return sortEntries(this.data.entries).map((entry) => ({ ...entry, tags: [...entry.tags] }));
  }

  getEntry(id: string): TimeEntry | null {
    const found = this.data.entries.find((entry) => entry.id === id);
    return found ? { ...found, tags: [...found.tags] } : null;
  }

  getCategories(): Category[] {
    return this.getSettings().categories.filter((category) => category.enabled).sort((left, right) => left.sortOrder - right.sortOrder);
  }

  getLastTimedEntry(date: string): TimeEntry | null {
    return this.getEntries()
      .filter((entry) => entry.date === date && entry.startTime && entry.endTime)
      .at(-1) ?? null;
  }

  async replaceSettings(settings: PluginSettings): Promise<void> {
    this.data.settings = sanitizeSettings(settings, getCurrentLocale());
    await this.persist();
  }

  async replaceEntry(existingId: string | undefined, nextEntries: TimeEntry[]): Promise<void> {
    if (existingId) {
      this.data.entries = this.data.entries.filter((entry) => entry.id !== existingId && !entry.id.startsWith(`${existingId}-`));
    }

    const nextIds = new Set(nextEntries.map((entry) => entry.id));
    this.data.entries = this.data.entries.filter((entry) => !nextIds.has(entry.id));
    this.data.entries.push(...nextEntries.map((entry) => ({ ...entry, tags: [...entry.tags] })));
    this.touchRecentCategory(nextEntries[0]?.categoryId);
    this.data.entries = sortEntries(this.data.entries);
    await this.persist();
  }

  async deleteEntry(id: string): Promise<void> {
    this.data.entries = this.data.entries.filter((entry) => entry.id !== id);
    await this.persist();
  }

  private touchRecentCategory(categoryId?: string): void {
    if (!categoryId) {
      return;
    }

    const recent = this.data.settings.recentCategoryIds.filter((item) => item !== categoryId);
    recent.unshift(categoryId);
    this.data.settings.recentCategoryIds = recent.slice(0, this.data.settings.maxRecentCategories);
  }

  private async persist(): Promise<void> {
    await this.plugin.saveData(this.data);
  }
}

function mergeData(loaded: unknown, locale = getCurrentLocale()): TimeLedgerData {
  const data = createDefaultData(locale);
  if (!loaded || typeof loaded !== "object") {
    return data;
  }

  const candidate: Partial<TimeLedgerData> = loaded;
  const entries = Array.isArray(candidate.entries) ? candidate.entries : [];
  return {
    version: typeof candidate.version === "number" ? candidate.version : data.version,
    entries: sortEntries(entries.map(sanitizeEntry)),
    settings: sanitizeSettings(candidate.settings, locale),
  };
}

function sanitizeEntry(entry: Partial<TimeEntry>): TimeEntry {
  return {
    id: String(entry.id ?? crypto.randomUUID()),
    date: String(entry.date ?? ""),
    startTime: typeof entry.startTime === "string" ? entry.startTime : undefined,
    endTime: typeof entry.endTime === "string" ? entry.endTime : undefined,
    durationMinutes: Number(entry.durationMinutes ?? 0),
    timeInputStyle: sanitizeTimeInputStyle(entry.timeInputStyle),
    categoryId: String(entry.categoryId ?? ""),
    tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
    project: String(entry.project ?? ""),
    note: String(entry.note ?? ""),
    source: entry.source === "timer" ? "timer" : "manual",
    createdAt: String(entry.createdAt ?? new Date().toISOString()),
    updatedAt: String(entry.updatedAt ?? new Date().toISOString()),
  };
}

function sanitizeSettings(candidate: Partial<PluginSettings> | undefined, locale = getCurrentLocale()): PluginSettings {
  const defaults = createDefaultData(locale).settings;
  const t = createTranslator(locale);
  if (!candidate) {
    return defaults;
  }

  const categories = Array.isArray(candidate.categories) && candidate.categories.length
    ? candidate.categories.map((category, index) => ({
        id: String(category.id ?? `category-${index + 1}`),
        name: String(category.name ?? t("defaults.categoryFallbackName", { index: index + 1 })),
        color: String(category.color ?? "#64748b"),
        sortOrder: Number(category.sortOrder ?? index + 1),
        enabled: category.enabled !== false,
        isProductive: category.isProductive !== false,
      }))
    : defaults.categories;

  return {
    categories,
    maxRecentCategories: Math.max(1, Number(candidate.maxRecentCategories ?? defaults.maxRecentCategories)),
    autoFillFromLastEntry: candidate.autoFillFromLastEntry ?? defaults.autoFillFromLastEntry,
    defaultRangeMinutes: Math.max(5, Number(candidate.defaultRangeMinutes ?? defaults.defaultRangeMinutes)),
    exportFolder: String(candidate.exportFolder ?? defaults.exportFolder),
    recentCategoryIds: Array.isArray(candidate.recentCategoryIds) ? candidate.recentCategoryIds.map(String) : defaults.recentCategoryIds,
    dailyNote: {
      enabled: candidate.dailyNote?.enabled ?? defaults.dailyNote.enabled,
      folder: String(candidate.dailyNote?.folder ?? defaults.dailyNote.folder),
      filenameFormat: String(candidate.dailyNote?.filenameFormat ?? defaults.dailyNote.filenameFormat),
      heading: String(candidate.dailyNote?.heading ?? defaults.dailyNote.heading),
      blockId: String(candidate.dailyNote?.blockId ?? defaults.dailyNote.blockId),
    },
    smartCategory: {
      enabled: candidate.smartCategory?.enabled ?? defaults.smartCategory.enabled,
      autoApplyHighConfidence: candidate.smartCategory?.autoApplyHighConfidence ?? defaults.smartCategory.autoApplyHighConfidence,
      enableAISuggestions: candidate.smartCategory?.enableAISuggestions ?? defaults.smartCategory.enableAISuggestions,
      applyAISuggestedTags: candidate.smartCategory?.applyAISuggestedTags ?? defaults.smartCategory.applyAISuggestedTags,
    },
    ai: {
      enabled: candidate.ai?.enabled ?? defaults.ai.enabled,
      baseUrl: String(candidate.ai?.baseUrl ?? defaults.ai.baseUrl),
      apiKey: String(candidate.ai?.apiKey ?? defaults.ai.apiKey),
      model: String(candidate.ai?.model ?? defaults.ai.model),
      includeNotes: candidate.ai?.includeNotes ?? defaults.ai.includeNotes,
      timeoutMs: Math.max(1000, Number(candidate.ai?.timeoutMs ?? defaults.ai.timeoutMs)),
    },
  };
}

function cloneSettings(settings: PluginSettings): PluginSettings {
  return {
    ...settings,
    categories: settings.categories.map((category) => ({ ...category })),
    recentCategoryIds: [...settings.recentCategoryIds],
    dailyNote: { ...settings.dailyNote },
    smartCategory: { ...settings.smartCategory },
    ai: { ...settings.ai },
  };
}

function sanitizeTimeInputStyle(value: unknown): TimeInputStyle | undefined {
  return value === "range_compact" || value === "range_clock" || value === "duration_minutes" || value === "duration_hm"
    ? value
    : undefined;
}

function getCurrentLocale() {
  return resolveLocale(getLanguage());
}
