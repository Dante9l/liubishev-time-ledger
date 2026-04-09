import {
  getLanguage,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  normalizePath,
} from "obsidian";
import { AICategoryContext, AIReviewContext, canUseAI, generateAIReview, suggestCategoryWithAI } from "./ai.js";
import { suggestCategory } from "./category-suggest.js";
import { buildDailyNoteBlock, renderDailyNotePath, upsertLedgerBlock } from "./daily-note.js";
import { buildSummaryArtifact, buildSummaryMarkdown, buildRawArtifact, buildRawMarkdown } from "./markdown.js";
import { Locale, resolveLocale, translate } from "./i18n.js";
import { TimeLedgerSettingTab } from "./settings.js";
import { buildSummaryHighlights, summarizePeriod } from "./stats.js";
import { TimeLedgerStore } from "./store.js";
import {
  buildSuggestedTimeInput,
  computeElapsedMinutes,
  formatDuration,
  formatTimeInputForEntry,
  inferTimeInputStyle,
  minutesFromTimeKey,
  parseTimeInput,
  splitEntryAcrossMidnight,
  toDateKey,
} from "./time.js";
import { CategorySuggestion, EntryDraft, EntryFormSeed, PeriodSummary, PluginSettings, StatsPeriod, SuggestedEntryDraft, TimeEntry, TimeParseResult } from "./types.js";
import { QuickEntryModal } from "./ui/entry-modal.js";
import { ReviewResultModal } from "./ui/review-modal.js";
import { StatsView } from "./ui/stats-view.js";
import { TodayView } from "./ui/today-view.js";
import { pickLeafForViewActivation } from "./view-activation.js";
import { STATS_VIEW_TYPE, TODAY_VIEW_TYPE } from "./view-types.js";

export default class LiubishevTimeLedgerPlugin extends Plugin {
  private readonly store = new TimeLedgerStore(this);

  async onload(): Promise<void> {
    await this.store.load();
    this.registerView(TODAY_VIEW_TYPE, (leaf) => new TodayView(leaf, this));
    this.registerView(STATS_VIEW_TYPE, (leaf) => new StatsView(leaf, this));
    this.addRibbonIcon("clock", this.t("command.openQuickEntry"), () => this.openQuickEntryModal());
    this.addSettingTab(new TimeLedgerSettingTab(this.app, this));
    this.registerCommands();
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(TODAY_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(STATS_VIEW_TYPE);
  }

  getSettings(): PluginSettings {
    return this.store.getSettings();
  }

  getLocale(): Locale {
    return resolveLocale(getLanguage());
  }

  t(key: string, vars?: Record<string, string | number | undefined>): string {
    return translate(this.getLocale(), key, vars);
  }

  async saveSettings(settings: PluginSettings): Promise<void> {
    await this.store.replaceSettings(settings);
    await this.refreshViews();
  }

  getEntries(): TimeEntry[] {
    return this.store.getEntries();
  }

  getOrderedCategories() {
    const settings = this.getSettings();
    const recent = settings.recentCategoryIds;
    return [...settings.categories]
      .filter((category) => category.enabled)
      .sort((left, right) => {
        const leftRecent = recent.indexOf(left.id);
        const rightRecent = recent.indexOf(right.id);
        if (leftRecent !== -1 || rightRecent !== -1) {
          if (leftRecent === -1) {
            return 1;
          }

          if (rightRecent === -1) {
            return -1;
          }

          return leftRecent - rightRecent;
        }

        return left.sortOrder - right.sortOrder;
      });
  }

  getTodayDateKey(): string {
    return toDateKey(new Date());
  }

  getSuggestedDraft(seed: EntryFormSeed = {}): SuggestedEntryDraft {
    const settings = this.getSettings();
    const categories = this.getOrderedCategories();
    const date = seed.date ?? this.getTodayDateKey();
    const entries = settings.autoFillFromLastEntry ? this.filterEntriesByDate(date, seed.id) : [];
    const defaultCategoryId = seed.categoryId ?? categories[0]?.id ?? settings.categories[0]?.id ?? "";
    const suggestion = this.getCategorySuggestion({
      project: seed.project ?? "",
      note: seed.note ?? "",
      tags: seed.tags ?? [],
    }, seed.id);
    return {
      date,
      timeInput: seed.timeInput ?? buildSuggestedTimeInput(entries, date, settings.defaultRangeMinutes),
      categoryId: suggestion?.confidence === "high" && settings.smartCategory.autoApplyHighConfidence
        ? suggestion.categoryId
        : defaultCategoryId,
    };
  }

  getContinueSeed(date = this.getTodayDateKey()): EntryFormSeed {
    const lastEntry = this.store.getLastTimedEntry(date);
    if (!lastEntry) {
      return { date };
    }

    return {
      date,
      timeInput: buildSuggestedTimeInput(this.filterEntriesByDate(date), date, this.getSettings().defaultRangeMinutes),
      categoryId: lastEntry.categoryId,
      tags: [...lastEntry.tags],
      project: lastEntry.project,
      note: "",
      source: lastEntry.source,
    };
  }

  getRecentCategoryIds(): string[] {
    return this.getSettings().recentCategoryIds;
  }

  getCategorySuggestion(
    input: { project?: string; note?: string; tags?: string[] },
    excludedId?: string,
  ): CategorySuggestion | null {
    const settings = this.getSettings();
    if (!settings.smartCategory.enabled) {
      return null;
    }

    return suggestCategory(
      input,
      settings.categories,
      this.getEntries().filter((entry) => !matchesExcludedId(entry.id, excludedId)),
      this.getLocale(),
    );
  }

  canUseAICategorySuggestion(): boolean {
    const settings = this.getSettings();
    return settings.smartCategory.enableAISuggestions && canUseAI(settings.ai);
  }

  async generateAICategorySuggestion(
    input: { project?: string; note?: string; tags?: string[] },
    excludedId?: string,
  ): Promise<CategorySuggestion> {
    const settings = this.getSettings();
    if (!settings.smartCategory.enableAISuggestions) {
      throw new Error(this.t("error.enableAiCategoryReviewFirst"));
    }

    const localSuggestion = this.getCategorySuggestion(input, excludedId);
    const context: AICategoryContext = {
      project: input.project?.trim() ?? "",
      note: settings.ai.includeNotes ? input.note?.trim() ?? "" : "",
      tags: input.tags ?? [],
      categories: this.getOrderedCategories().map((item) => ({ id: item.id, name: item.name })),
      localSuggestion,
      relatedEntries: this.getRelatedEntriesForAISuggestion(input, excludedId),
    };
    return suggestCategoryWithAI(settings.ai, context, this.getLocale());
  }

  previewTimeInput(date: string, timeInput: string, excludedId?: string): TimeParseResult {
    const settings = this.getSettings();
    const fallbackEntries = settings.autoFillFromLastEntry ? this.filterEntriesByDate(date, excludedId) : [];
    const suggested = buildSuggestedTimeInput(fallbackEntries, date, settings.defaultRangeMinutes);
    const [defaultStartTime, defaultEndTime] = suggested.split("-");
    return parseTimeInput(timeInput, { defaultStartTime, defaultEndTime }, this.getLocale());
  }

  openQuickEntryModal(seed: EntryFormSeed = {}): void {
    new QuickEntryModal(this.app, this, seed).open();
  }

  openEditEntry(entryId: string): void {
    const entry = this.store.getEntry(entryId);
    if (!entry) {
      new Notice(this.t("error.cannotFindEntryToEdit"));
      return;
    }

    this.openQuickEntryModal(this.buildSeedFromEntry(entry));
  }

  openDuplicateEntry(entryId: string): void {
    const entry = this.store.getEntry(entryId);
    if (!entry) {
      new Notice(this.t("error.cannotFindEntryToDuplicate"));
      return;
    }

    const seed = this.buildSeedFromEntry(entry);
    delete seed.id;
    this.openQuickEntryModal(seed);
  }

  async saveDraft(draft: EntryDraft): Promise<TimeEntry[]> {
    if (!draft.date) {
      throw new Error(this.t("error.dateRequired"));
    }

    if (!draft.categoryId) {
      throw new Error(this.t("error.categoryRequired"));
    }

    const parsed = this.previewTimeInput(draft.date, draft.timeInput, draft.id);
    const previousEntries = draft.id ? this.findEntryGroup(draft.id) : [];
    const existing = draft.id ? this.store.getEntry(draft.id) : null;
    const now = new Date().toISOString();
    const baseEntry: TimeEntry = {
      id: draft.id ?? crypto.randomUUID(),
      date: draft.date,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      durationMinutes: parsed.durationMinutes,
      timeInputStyle: inferTimeInputStyle(draft.timeInput),
      categoryId: draft.categoryId,
      tags: Array.from(new Set(draft.tags.filter(Boolean))),
      project: draft.project.trim(),
      note: draft.note.trim(),
      source: draft.source,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const nextEntries = parsed.mode === "range" ? splitEntryAcrossMidnight(baseEntry) : [baseEntry];
    this.ensureNoOverlap(nextEntries, draft.id);
    await this.store.replaceEntry(draft.id, nextEntries);
    await this.syncDailyNotesForDates(collectAffectedDates(previousEntries, nextEntries));
    await this.refreshViews();
    return nextEntries;
  }

  async deleteEntry(entryId: string): Promise<void> {
    const previousEntries = this.findEntryGroup(entryId);
    await this.store.deleteEntry(entryId);
    await this.syncDailyNotesForDates(previousEntries.map((entry) => entry.date));
    await this.refreshViews();
  }

  getPeriodSummary(period: StatsPeriod, referenceDate = this.getTodayDateKey()): PeriodSummary {
    return summarizePeriod(this.getEntries(), this.getSettings().categories, period, referenceDate, this.getLocale());
  }

  getSummaryHighlights(summary: PeriodSummary): string[] {
    return buildSummaryHighlights(summary, this.getLocale());
  }

  async syncDailyNotesForDates(dateKeys: string[]): Promise<void> {
    const settings = this.getSettings();
    if (!settings.dailyNote.enabled) {
      return;
    }

    const uniqueDates = Array.from(new Set(dateKeys.filter(Boolean)));
    for (const dateKey of uniqueDates) {
      const summary = this.getPeriodSummary("day", dateKey);
      const content = buildDailyNoteBlock(summary, settings.categories, settings.dailyNote, this.getLocale());
      const notePath = renderDailyNotePath(dateKey, settings.dailyNote);
      await this.ensureFolderExists(notePath.split("/").slice(0, -1).join("/"));
      const existing = this.app.vault.getAbstractFileByPath(notePath);
      if (existing instanceof TFile) {
        const current = await this.app.vault.read(existing);
        const next = upsertLedgerBlock(current, content, settings.dailyNote.blockId);
        await this.app.vault.modify(existing, next);
      } else {
        await this.app.vault.create(notePath, content);
      }
    }
  }

  async activateTodayView(): Promise<void> {
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      return;
    }

    await leaf.setViewState({ type: TODAY_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async activateStatsView(): Promise<void> {
    const { leaf, reused } = pickLeafForViewActivation(
      this.app.workspace.getLeavesOfType(STATS_VIEW_TYPE),
      () => this.app.workspace.getRightLeaf(false),
    );
    if (!leaf) {
      return;
    }

    if (!reused) {
      await leaf.setViewState({ type: STATS_VIEW_TYPE, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }

  async exportPeriod(period: StatsPeriod, kind: "summary" | "raw"): Promise<string> {
    const summary = this.getPeriodSummary(period);
    const artifact = kind === "summary"
      ? buildSummaryArtifact(summary, this.getSettings().categories, this.getLocale())
      : buildRawArtifact(summary, this.getSettings().categories, this.getLocale());
    const path = await this.createExportFile(artifact.fileName, artifact.content);
    new Notice(this.t("notice.exportedTo", { path }));
    return path;
  }

  async generateAndOpenAIReview(period: StatsPeriod): Promise<void> {
    if (period === "day") {
      new Notice(this.t("error.aiReviewDayUnsupported"));
      return;
    }

    try {
      const settings = this.getSettings();
      const summary = this.getPeriodSummary(period);
      const categories = settings.categories;
      const summaryMarkdown = buildSummaryMarkdown(summary, categories, this.getLocale());
      const rawEntries = settings.ai.includeNotes
        ? summary.entries
        : summary.entries.map((entry) => ({ ...entry, note: "" }));
      const rawMarkdown = buildRawMarkdown(rawEntries, categories, this.t("markdown.rawTitle", { label: summary.label }));
      const context: AIReviewContext = {
        periodLabel: summary.label,
        summaryMarkdown,
        rawMarkdown,
      };
      const review = await generateAIReview(settings.ai, context, this.getLocale());
      new ReviewResultModal(this.app, this, `${summary.label} ${this.t("common.action.aiReview")}`, review).open();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : this.t("error.aiReviewFailed"));
    }
  }

  async insertOrExportMarkdown(title: string, content: string): Promise<void> {
    const markdown = content.startsWith("## ") ? content : `## ${title}\n\n${content.trim()}\n`;
    if (this.insertIntoActiveNote(markdown)) {
      new Notice(this.t("notice.insertedIntoCurrentNote"));
      return;
    }

    const path = await this.createExportFile(`${sanitizeFileName(title)}.md`, markdown);
    new Notice(this.t("notice.noActiveNoteExported", { path }));
  }

  async refreshViews(): Promise<void> {
    await this.refreshView(TODAY_VIEW_TYPE);
    await this.refreshView(STATS_VIEW_TYPE);
  }

  private registerCommands(): void {
    this.addCommand({
      id: "open-quick-entry",
      name: this.t("command.openQuickEntry"),
      callback: () => this.openQuickEntryModal(),
    });
    this.addCommand({
      id: "continue-from-last-entry",
      name: this.t("command.continueFromLastEntry"),
      callback: () => this.openQuickEntryModal(this.getContinueSeed()),
    });
    this.addCommand({
      id: "open-today-view",
      name: this.t("command.openTodayView"),
      callback: () => void this.activateTodayView(),
    });
    this.addCommand({
      id: "open-stats-view",
      name: this.t("command.openStatsView"),
      callback: () => void this.activateStatsView(),
    });
    this.addCommand({
      id: "export-today-summary",
      name: this.t("command.exportTodaySummary"),
      callback: () => void this.exportPeriod("day", "summary"),
    });
    this.addCommand({
      id: "export-week-summary",
      name: this.t("command.exportWeekSummary"),
      callback: () => void this.exportPeriod("week", "summary"),
    });
    this.addCommand({
      id: "export-month-summary",
      name: this.t("command.exportMonthSummary"),
      callback: () => void this.exportPeriod("month", "summary"),
    });
    this.addCommand({
      id: "generate-week-review",
      name: this.t("command.generateWeekReview"),
      callback: () => void this.generateAndOpenAIReview("week"),
    });
    this.addCommand({
      id: "generate-month-review",
      name: this.t("command.generateMonthReview"),
      callback: () => void this.generateAndOpenAIReview("month"),
    });
    this.addCommand({
      id: "sync-today-daily-note",
      name: this.t("command.syncTodayDailyNote"),
      callback: () => void this.syncDailyNotesForDates([this.getTodayDateKey()]),
    });
  }

  private filterEntriesByDate(date: string, excludedId?: string): TimeEntry[] {
    return this.getEntries().filter((entry) => entry.date === date && !matchesExcludedId(entry.id, excludedId));
  }

  private ensureNoOverlap(nextEntries: TimeEntry[], excludedId?: string): void {
    const existingEntries = this.getEntries().filter((entry) => !matchesExcludedId(entry.id, excludedId));
    for (const nextEntry of nextEntries) {
      if (!nextEntry.startTime || !nextEntry.endTime) {
        continue;
      }

      for (const existing of existingEntries) {
        if (existing.date !== nextEntry.date || !existing.startTime || !existing.endTime) {
          continue;
        }

        const overlaps = minutesRangeOverlap(nextEntry.startTime, nextEntry.endTime, existing.startTime, existing.endTime);
        if (overlaps) {
          throw new Error(this.t("error.overlapExisting", { date: existing.date, start: existing.startTime, end: existing.endTime }));
        }
      }
    }
  }

  private buildSeedFromEntry(entry: TimeEntry): EntryFormSeed {
    return {
      id: entry.id,
      date: entry.date,
      timeInput: formatTimeInputForEntry(entry),
      categoryId: entry.categoryId,
      tags: [...entry.tags],
      project: entry.project,
      note: entry.note,
      source: entry.source,
    };
  }

  private findEntryGroup(entryId: string): TimeEntry[] {
    const rootId = getRootEntryId(entryId);
    return this.getEntries().filter((entry) => matchesExcludedId(entry.id, rootId));
  }

  private getRelatedEntriesForAISuggestion(
    input: { project?: string; note?: string; tags?: string[] },
    excludedId?: string,
  ): Array<{ categoryName: string; project: string; note: string; tags: string[] }> {
    const tags = new Set((input.tags ?? []).map((item) => item.toLowerCase()));
    const project = input.project?.trim().toLowerCase() ?? "";
    const note = input.note?.trim().toLowerCase() ?? "";

    return this.getEntries()
      .filter((entry) => !matchesExcludedId(entry.id, excludedId))
      .map((entry) => ({
        entry,
        score: computeHistoryScore(entry, project, note, tags),
      }))
      .sort((left, right) => right.score - left.score || right.entry.updatedAt.localeCompare(left.entry.updatedAt))
      .slice(0, 5)
      .map(({ entry }) => ({
        categoryName: this.getOrderedCategories().find((item) => item.id === entry.categoryId)?.name ?? entry.categoryId,
        project: entry.project,
        note: entry.note,
        tags: entry.tags,
      }));
  }

  private async refreshView(viewType: string): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(viewType)) {
      const view = leaf.view as { refresh?: () => Promise<void> | void };
      await view.refresh?.();
    }
  }

  private insertIntoActiveNote(markdown: string): boolean {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      return false;
    }

    const editor = view.editor;
    const insertion = editor.getSelection() ? markdown : `${markdown}\n\n`;
    editor.replaceSelection(insertion);
    return true;
  }

  private async createExportFile(fileName: string, content: string): Promise<string> {
    const folderPath = normalizePath(this.getSettings().exportFolder || "Time Ledger Exports");
    await this.ensureFolderExists(folderPath);
    const normalizedPath = normalizePath(`${folderPath}/${sanitizeFileName(fileName)}`);
    const availablePath = this.getAvailablePath(normalizedPath);
    await this.app.vault.create(availablePath, content);
    return availablePath;
  }

  private async ensureFolderExists(folderPath: string): Promise<void> {
    if (!folderPath) {
      return;
    }

    const parts = folderPath.split("/").filter(Boolean);
    let currentPath = "";
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(currentPath);
      if (!existing) {
        await this.app.vault.createFolder(currentPath);
      }
    }
  }

  private getAvailablePath(path: string): string {
    if (!this.app.vault.getAbstractFileByPath(path)) {
      return path;
    }

    const dotIndex = path.lastIndexOf(".");
    const baseName = dotIndex === -1 ? path : path.slice(0, dotIndex);
    const extension = dotIndex === -1 ? "" : path.slice(dotIndex);
    let index = 1;
    while (true) {
      const candidate = `${baseName}-${index}${extension}`;
      if (!this.app.vault.getAbstractFileByPath(candidate)) {
        return candidate;
      }
      index += 1;
    }
  }
}

function minutesRangeOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const startAMinutes = toAbsoluteMinutes(startA);
  const endAMinutes = endA === "24:00" ? 24 * 60 : startAMinutes + computeElapsedMinutes(startA, endA);
  const startBMinutes = toAbsoluteMinutes(startB);
  const endBMinutes = endB === "24:00" ? 24 * 60 : startBMinutes + computeElapsedMinutes(startB, endB);
  return startAMinutes < endBMinutes && startBMinutes < endAMinutes;
}

function toAbsoluteMinutes(timeKey: string): number {
  return minutesFromTimeKey(timeKey);
}

function matchesExcludedId(entryId: string, excludedId?: string): boolean {
  return Boolean(excludedId && (entryId === excludedId || entryId.startsWith(`${excludedId}-`)));
}

function getRootEntryId(entryId: string): string {
  return entryId.endsWith("-next") ? entryId.slice(0, -5) : entryId;
}

function collectAffectedDates(previousEntries: TimeEntry[], nextEntries: TimeEntry[]): string[] {
  return Array.from(new Set([...previousEntries, ...nextEntries].map((entry) => entry.date)));
}

function computeHistoryScore(
  entry: TimeEntry,
  project: string,
  note: string,
  tags: Set<string>,
): number {
  let score = 0;
  if (project && entry.project.toLowerCase() === project) {
    score += 5;
  }

  for (const tag of entry.tags) {
    if (tags.has(tag.toLowerCase())) {
      score += 3;
    }
  }

  if (note && entry.note.toLowerCase().includes(note.slice(0, 8))) {
    score += 1;
  }

  return score;
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[\\/:*?"<>|]/g, "-");
}
