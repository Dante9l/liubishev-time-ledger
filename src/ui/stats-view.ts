import { ItemView, WorkspaceLeaf } from "obsidian";
import type LiubishevTimeLedgerPlugin from "../main.js";
import { formatDuration, minutesFromTimeKey } from "../time.js";
import { StatsPeriod, TimeEntry } from "../types.js";
import { STATS_VIEW_TYPE } from "../view-types.js";

export class StatsView extends ItemView {
  private period: StatsPeriod = "day";

  constructor(leaf: WorkspaceLeaf, private readonly plugin: LiubishevTimeLedgerPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return STATS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.plugin.t("stats.displayText");
  }

  getIcon(): string {
    return "bar-chart-3";
  }

  onOpen(): Promise<void> {
    this.refresh();
    return Promise.resolve();
  }

  refresh(): void {
    const t = this.plugin.t.bind(this.plugin);
    const summary = this.plugin.getPeriodSummary(this.period, this.plugin.getTodayDateKey());
    const categories = this.plugin.getSettings().categories;
    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    const topCategory = summary.categorySummaries[0];
    const productiveRate = summary.totalMinutes > 0
      ? `${Math.round((summary.productiveMinutes / summary.totalMinutes) * 100)}%`
      : "0%";

    this.contentEl.empty();
    this.contentEl.addClass("time-ledger-view-shell");

    const header = this.contentEl.createDiv({ cls: "time-ledger-view-header" });
    const heading = header.createDiv({ cls: "time-ledger-view-heading" });
    heading.createEl("p", { cls: "time-ledger-view-kicker", text: t("stats.kicker") });
    heading.createEl("h2", { text: t("stats.title") });
    heading.createEl("p", {
      cls: "time-ledger-view-subtitle",
      text: t("stats.subtitle", { label: summary.label }),
    });

    const toolbar = this.contentEl.createDiv({ cls: "time-ledger-toolbar" });
    const periodButtons = toolbar.createDiv({ cls: "time-ledger-segmented" });
    createPeriodButton(periodButtons, t("common.period.day"), this.period === "day", () => this.setPeriod("day"));
    createPeriodButton(periodButtons, t("common.period.week"), this.period === "week", () => this.setPeriod("week"));
    createPeriodButton(periodButtons, t("common.period.month"), this.period === "month", () => this.setPeriod("month"));

    const actions = toolbar.createDiv({ cls: "time-ledger-actions time-ledger-actions-end" });
    createActionButton(actions, t("stats.action.exportReport"), () => this.plugin.exportPeriod(this.period, "summary"));
    createActionButton(actions, t("stats.action.exportRaw"), () => this.plugin.exportPeriod(this.period, "raw"));
    if (this.period !== "day") {
      createActionButton(actions, t("common.action.aiReview"), () => this.plugin.generateAndOpenAIReview(this.period), true);
    }

    const summaryGrid = this.contentEl.createDiv({ cls: "time-ledger-summary-grid time-ledger-summary-grid--stats" });
    createSummaryCard(
      summaryGrid,
      t("stats.summary.total"),
      formatDuration(summary.totalMinutes),
      summary.entryCount ? t("common.entryCount", { count: summary.entryCount }) : t("stats.summary.totalMeta.empty"),
      true,
    );
    createSummaryCard(
      summaryGrid,
      t("stats.summary.effective"),
      formatDuration(summary.productiveMinutes),
      t("stats.summary.effectiveMeta", { rate: productiveRate }),
    );
    createSummaryCard(
      summaryGrid,
      t("stats.summary.topCategory"),
      topCategory?.name ?? t("common.none"),
      topCategory
        ? t("stats.summary.topCategoryMeta", { duration: formatDuration(topCategory.totalMinutes), count: topCategory.entryCount })
        : t("stats.summary.topCategoryEmpty"),
    );
    createSummaryCard(
      summaryGrid,
      t("stats.summary.tagHotspot"),
      summary.tagSummaries[0] ? `#${summary.tagSummaries[0].tag}` : t("common.none"),
      summary.tagSummaries[0]
        ? t("stats.summary.tagHotspotMeta", {
            duration: formatDuration(summary.tagSummaries[0].totalMinutes),
            count: summary.tagSummaries[0].entryCount,
          })
        : t("stats.summary.tagHotspotEmpty"),
    );

    const categorySection = this.contentEl.createDiv({ cls: "time-ledger-section" });
    const categoryHeader = categorySection.createDiv({ cls: "time-ledger-section-header" });
    const categoryTitle = categoryHeader.createDiv({ cls: "time-ledger-section-title-group" });
    categoryTitle.createEl("h3", { text: t("stats.category.title") });
    categoryTitle.createEl("p", {
      cls: "time-ledger-section-description",
      text: t("stats.category.description"),
    });

    if (summary.categorySummaries.length) {
      const categoryList = categorySection.createDiv({ cls: "time-ledger-category-list" });
      for (const item of summary.categorySummaries) {
        const row = categoryList.createDiv({ cls: "time-ledger-category-row" });
        row.style.setProperty("--entry-color", item.color);

        const rowHead = row.createDiv({ cls: "time-ledger-category-row-head" });
        const name = rowHead.createDiv({ cls: "time-ledger-category-name" });
        name.createSpan({ cls: "time-ledger-category-dot" });
        name.createSpan({ text: item.name });
        rowHead.createSpan({
          cls: "time-ledger-category-metric",
          text: t("stats.category.metric", { duration: formatDuration(item.totalMinutes), count: item.entryCount }),
        });

        const bar = row.createDiv({ cls: "time-ledger-category-bar" });
        const fill = bar.createDiv({ cls: "time-ledger-category-bar-fill" });
        const width = summary.totalMinutes > 0 ? (item.totalMinutes / summary.totalMinutes) * 100 : 0;
        fill.style.width = `${Math.max(width, 6)}%`;

        row.createSpan({
          cls: "time-ledger-muted",
          text: item.productiveMinutes > 0
            ? t("stats.category.productive", { duration: formatDuration(item.productiveMinutes) })
            : t("stats.category.nonProductive"),
        });
      }
    } else {
      const empty = categorySection.createDiv({ cls: "time-ledger-empty-state" });
      empty.createEl("h3", { text: t("stats.category.emptyTitle") });
      empty.createEl("p", { text: t("stats.category.emptyDescription") });
    }

    if (summary.tagSummaries.length) {
      const tagSection = this.contentEl.createDiv({ cls: "time-ledger-section" });
      const tagHeader = tagSection.createDiv({ cls: "time-ledger-section-header" });
      const tagTitle = tagHeader.createDiv({ cls: "time-ledger-section-title-group" });
      tagTitle.createEl("h3", { text: t("stats.tags.title") });
      tagTitle.createEl("p", {
        cls: "time-ledger-section-description",
        text: t("stats.tags.description"),
      });

      const tagList = tagSection.createDiv({ cls: "time-ledger-tag-list" });
      for (const item of summary.tagSummaries.slice(0, 10)) {
        const pill = tagList.createDiv({ cls: "time-ledger-tag-pill" });
        pill.createSpan({ text: `#${item.tag}` });
        pill.createSpan({
          cls: "time-ledger-tag-pill-meta",
          text: t("stats.tags.metric", { duration: formatDuration(item.totalMinutes), count: item.entryCount }),
        });
      }
    }

    const entrySection = this.contentEl.createDiv({ cls: "time-ledger-section" });
    const entryHeader = entrySection.createDiv({ cls: "time-ledger-section-header" });
    const entryTitle = entryHeader.createDiv({ cls: "time-ledger-section-title-group" });
    entryTitle.createEl("h3", { text: t("stats.preview.title") });
    entryTitle.createEl("p", {
      cls: "time-ledger-section-description",
      text: t("stats.preview.description"),
    });

    if (!summary.entries.length) {
      const empty = entrySection.createDiv({ cls: "time-ledger-empty-state" });
      empty.createEl("h3", { text: t("stats.preview.emptyTitle") });
      empty.createEl("p", { text: t("stats.preview.emptyDescription") });
      return;
    }

    const entryList = entrySection.createDiv({ cls: "time-ledger-entry-list" });
    for (const entry of sortEntriesForPreview(summary.entries)) {
      const category = categoryMap.get(entry.categoryId);
      const card = entryList.createDiv({ cls: "time-ledger-entry-card time-ledger-entry-card--preview" });
      if (category?.color) {
        card.style.setProperty("--entry-color", category.color);
      }

      const top = card.createDiv({ cls: "time-ledger-entry-card-top" });
      const info = top.createDiv({ cls: "time-ledger-entry-card-main" });
      info.createSpan({
        cls: "time-ledger-entry-time",
        text: `${entry.date} · ${getTimeLabel(entry)}`,
      });
      info.createSpan({
        cls: "time-ledger-entry-meta",
        text: formatDuration(entry.durationMinutes),
      });
      top.createSpan({ cls: "time-ledger-category-badge", text: category?.name ?? entry.categoryId });

      const noteParts = [entry.project, entry.note].filter(Boolean);
      if (noteParts.length) {
        card.createDiv({ cls: "time-ledger-entry-note", text: noteParts.join(" / ") });
      }

      if (entry.tags.length) {
        card.createDiv({
          cls: "time-ledger-entry-tags",
          text: entry.tags.map((tag) => `#${tag}`).join(" "),
        });
      }
    }
  }

  private setPeriod(period: StatsPeriod): void {
    this.period = period;
    this.refresh();
  }
}

function createPeriodButton(container: HTMLElement, text: string, active: boolean, handler: () => void): void {
  const button = container.createEl("button", { text });
  button.type = "button";
  button.addClass("time-ledger-segmented-button");
  if (active) {
    button.addClass("is-active");
  }
  button.addEventListener("click", handler);
}

function createActionButton(
  container: HTMLElement,
  text: string,
  handler: () => void | Promise<unknown>,
  primary = false,
): void {
  const button = container.createEl("button", { text });
  button.type = "button";
  button.addClass("time-ledger-button", primary ? "time-ledger-button--primary" : "time-ledger-button--secondary");
  if (primary) {
    button.addClass("mod-cta");
  }
  button.addEventListener("click", () => void handler());
}

function createSummaryCard(
  container: HTMLElement,
  label: string,
  value: string,
  meta: string,
  emphasized = false,
): void {
  const card = container.createDiv({ cls: `time-ledger-summary-card${emphasized ? " is-emphasized" : ""}` });
  card.createSpan({ cls: "time-ledger-summary-label", text: label });
  card.createSpan({ cls: "time-ledger-summary-value", text: value });
  card.createSpan({ cls: "time-ledger-summary-meta", text: meta });
}

function sortEntriesForPreview(entries: TimeEntry[]): TimeEntry[] {
  return [...entries].sort((left, right) => {
    if (left.date !== right.date) {
      return right.date.localeCompare(left.date);
    }

    const leftStart = left.startTime ? minutesFromTimeKey(left.startTime) : -1;
    const rightStart = right.startTime ? minutesFromTimeKey(right.startTime) : -1;
    if (leftStart !== rightStart) {
      return rightStart - leftStart;
    }

    return right.createdAt.localeCompare(left.createdAt);
  });
}

function getTimeLabel(entry: TimeEntry): string {
  if (entry.startTime && entry.endTime) {
    return `${entry.startTime}-${entry.endTime}`;
  }

  return formatDuration(entry.durationMinutes);
}
