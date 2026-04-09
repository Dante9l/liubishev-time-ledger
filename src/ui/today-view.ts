import { ItemView, Menu, Notice, WorkspaceLeaf } from "obsidian";
import type LiubishevTimeLedgerPlugin from "../main.js";
import { formatDuration, minutesFromTimeKey } from "../time.js";
import { Category, GapSegment, TimeEntry } from "../types.js";
import { TODAY_VIEW_TYPE } from "../view-types.js";

const HOUR_ROW_HEIGHT = 56;
const MIN_ENTRY_BLOCK_HEIGHT = 24;

interface TimelineEntryLayout {
  entry: TimeEntry;
  category?: Category;
  startMinutes: number;
  endMinutes: number;
  top: number;
  height: number;
  column: number;
  columns: number;
  density: "normal" | "compact" | "mini";
}

interface TimelineModel {
  actualStartMinute: number;
  actualEndMinute: number;
  gridStartMinute: number;
  gridEndMinute: number;
  gridHeight: number;
  entries: TimelineEntryLayout[];
}

export class TodayView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private readonly plugin: LiubishevTimeLedgerPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return TODAY_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.plugin.t("today.displayText");
  }

  getIcon(): string {
    return "clock";
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const dateKey = this.plugin.getTodayDateKey();
    const summary = this.plugin.getPeriodSummary("day", dateKey);
    const categories = this.plugin.getSettings().categories;
    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    const timedEntries = getTimedEntries(summary.entries);
    const durationOnlyEntries = summary.entries.filter((entry) => !hasTimedRange(entry));

    this.contentEl.empty();
    this.contentEl.addClass("time-ledger-view-shell");

    this.renderHeader(summary.label);
    this.renderSummaryCards(summary);

    if (!summary.entries.length) {
      this.renderEmptyState();
      return;
    }

    this.renderTimelineSection(summary.gaps, timedEntries, categoryMap);

    if (durationOnlyEntries.length) {
      this.renderDurationOnlySection(durationOnlyEntries, categoryMap);
    }
  }

  private async confirmDeleteEntry(entryId: string): Promise<void> {
    if (!window.confirm(this.plugin.t("common.confirmDeleteEntry"))) {
      return;
    }

    await this.plugin.deleteEntry(entryId);
    new Notice(this.plugin.t("notice.entryDeleted"));
  }

  private bindMiniEntryInteractions(block: HTMLElement, entry: TimeEntry, category?: Category): void {
    block.addClass("is-interactive");
    block.tabIndex = 0;
    block.setAttr("role", "button");
    const tooltip = buildMiniEntryTooltip(entry, category, this.plugin);
    block.setAttr("aria-label", tooltip);
    block.setAttr("title", tooltip);

    block.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button")) {
        return;
      }

      this.plugin.openEditEntry(entry.id);
    });

    block.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const menu = new Menu();
      menu.addItem((item) => item.setTitle(this.plugin.t("common.edit")).onClick(() => this.plugin.openEditEntry(entry.id)));
      menu.addItem((item) => item.setTitle(this.plugin.t("common.duplicate")).onClick(() => this.plugin.openDuplicateEntry(entry.id)));
      menu.addItem((item) => item.setTitle(this.plugin.t("common.delete")).onClick(() => void this.confirmDeleteEntry(entry.id)));
      menu.showAtMouseEvent(event);
    });

    block.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.plugin.openEditEntry(entry.id);
      }
    });
  }

  private renderHeader(dateLabel: string): void {
    const t = this.plugin.t.bind(this.plugin);
    const header = this.contentEl.createDiv({ cls: "time-ledger-view-header" });
    const heading = header.createDiv({ cls: "time-ledger-view-heading" });
    heading.createEl("p", { cls: "time-ledger-view-kicker", text: t("today.kicker") });
    heading.createEl("h2", { text: t("today.title") });
    heading.createEl("p", {
      cls: "time-ledger-view-subtitle",
      text: t("today.subtitle", { dateLabel }),
    });

    const actions = header.createDiv({ cls: "time-ledger-actions time-ledger-actions-end" });
    createButton(actions, t("common.action.addEntry"), "primary", () => this.plugin.openQuickEntryModal());
    createButton(actions, t("common.action.statsView"), "secondary", () => void this.plugin.activateStatsView());
  }

  private renderSummaryCards(summary: ReturnType<LiubishevTimeLedgerPlugin["getPeriodSummary"]>): void {
    const t = this.plugin.t.bind(this.plugin);
    const summaryGrid = this.contentEl.createDiv({ cls: "time-ledger-summary-grid" });
    const longestGap = getLongestGap(summary.gaps);
    const productiveRate = summary.totalMinutes > 0
      ? `${Math.round((summary.productiveMinutes / summary.totalMinutes) * 100)}%`
      : t("common.noData");

    createSummaryCard(
      summaryGrid,
      t("today.summary.total"),
      formatDuration(summary.totalMinutes),
      summary.entryCount ? t("common.entryCount", { count: summary.entryCount }) : t("today.summary.totalMeta.empty"),
      true,
    );
    createSummaryCard(
      summaryGrid,
      t("today.summary.effective"),
      formatDuration(summary.productiveMinutes),
      summary.totalMinutes > 0 ? t("today.summary.effectiveMeta", { rate: productiveRate }) : productiveRate,
    );
    createSummaryCard(
      summaryGrid,
      t("today.summary.positioned"),
      this.plugin.t("common.itemCount", { count: summary.entries.filter((entry) => hasTimedRange(entry)).length }),
      t("today.summary.positionedMeta"),
    );
    createSummaryCard(
      summaryGrid,
      t("today.summary.longestGap"),
      longestGap ? formatDuration(longestGap.durationMinutes) : "—",
      longestGap ? `${longestGap.startTime}-${longestGap.endTime}` : t("today.summary.longestGapEmpty"),
    );
  }

  private renderTimelineSection(
    gaps: GapSegment[],
    entries: TimeEntry[],
    categoryMap: Map<string, Category>,
  ): void {
    const t = this.plugin.t.bind(this.plugin);
    const section = this.contentEl.createDiv({ cls: "time-ledger-section" });
    const sectionHeader = section.createDiv({ cls: "time-ledger-section-header" });
    const titleGroup = sectionHeader.createDiv({ cls: "time-ledger-section-title-group" });
    titleGroup.createEl("h3", { text: t("today.timeline.title") });
    titleGroup.createEl("p", {
      cls: "time-ledger-section-description",
      text: t("today.timeline.description"),
    });

    if (gaps.length) {
      const gapBadges = sectionHeader.createDiv({ cls: "time-ledger-inline-badges" });
      for (const gap of gaps) {
        gapBadges.createSpan({
          cls: "time-ledger-gap-badge",
          text: t("today.timeline.gapBadge", {
            start: gap.startTime,
            end: gap.endTime,
            duration: formatDuration(gap.durationMinutes),
          }),
        });
      }
    }

    if (!entries.length) {
      const empty = section.createDiv({ cls: "time-ledger-empty-state" });
      empty.createEl("h3", { text: t("today.timeline.emptyTitle") });
      empty.createEl("p", { text: t("today.timeline.emptyDescription") });
      return;
    }

    const timeline = buildTimelineModel(entries, categoryMap);
    const shell = section.createDiv({ cls: "time-ledger-timeline-shell" });
    shell.style.setProperty("--time-ledger-hour-height", `${HOUR_ROW_HEIGHT}px`);

    const timelineHeader = shell.createDiv({ cls: "time-ledger-timeline-header" });
    const timelineHeaderMain = timelineHeader.createDiv({ cls: "time-ledger-timeline-header-main" });
    timelineHeaderMain.createEl("strong", {
      cls: "time-ledger-timeline-title",
      text: t("today.timeline.actualRange", {
        start: formatTimelineTime(timeline.actualStartMinute),
        end: formatTimelineTime(timeline.actualEndMinute),
      }),
    });
    timelineHeaderMain.createEl("p", {
      cls: "time-ledger-muted",
      text: t("common.positionedEntryCount", { count: timeline.entries.length }),
    });
    timelineHeader.createSpan({
      cls: "time-ledger-timeline-scale",
      text: t("today.timeline.scale"),
    });

    const body = shell.createDiv({ cls: "time-ledger-timeline-body" });
    const hours = body.createDiv({ cls: "time-ledger-timeline-hours" });
    const lane = body.createDiv({ cls: "time-ledger-timeline-lane" });
    lane.style.height = `${timeline.gridHeight}px`;

    for (let minute = timeline.gridStartMinute; minute < timeline.gridEndMinute; minute += 60) {
      const marker = hours.createDiv({ cls: "time-ledger-hour-marker" });
      marker.style.height = `${HOUR_ROW_HEIGHT}px`;
      marker.createSpan({ cls: "time-ledger-hour-label", text: formatTimelineTime(minute) });
    }

    const footerMarker = hours.createDiv({ cls: "time-ledger-hour-marker time-ledger-hour-marker--tail" });
    footerMarker.createSpan({ cls: "time-ledger-hour-label", text: formatTimelineTime(timeline.gridEndMinute) });

    for (const item of timeline.entries) {
      const block = lane.createDiv({ cls: `time-ledger-entry-block is-${item.density}` });
      const columnWidth = 100 / item.columns;
      block.style.top = `${item.top}px`;
      block.style.height = `${item.height}px`;
      block.style.left = `calc(${columnWidth * item.column}% + 3px)`;
      block.style.width = `calc(${columnWidth}% - 6px)`;
      if (item.category?.color) {
        block.style.setProperty("--entry-color", item.category.color);
      }

      if (item.density === "mini") {
        this.bindMiniEntryInteractions(block, item.entry, item.category);
        block.createDiv({ cls: "time-ledger-entry-mini-indicator" });
        continue;
      }

      const header = block.createDiv({ cls: "time-ledger-entry-block-head" });
      const headerMain = header.createDiv({ cls: "time-ledger-entry-block-main" });
      headerMain.createSpan({ cls: "time-ledger-entry-time", text: `${item.entry.startTime}-${item.entry.endTime}` });
      headerMain.createSpan({ cls: "time-ledger-entry-duration", text: formatDuration(item.entry.durationMinutes) });
      header.createSpan({
        cls: "time-ledger-category-badge",
        text: item.category?.name ?? item.entry.categoryId,
      });

      const noteParts = [item.entry.project, item.entry.note].filter(Boolean);
      if (noteParts.length) {
        block.createDiv({ cls: "time-ledger-entry-note", text: noteParts.join(" / ") });
      }

      if (item.entry.tags.length) {
        block.createDiv({
          cls: "time-ledger-entry-tags",
          text: item.entry.tags.map((tag) => `#${tag}`).join(" "),
        });
      }

      const actions = block.createDiv({ cls: "time-ledger-entry-actions time-ledger-entry-actions--inline" });
      createButton(actions, t("common.edit"), "ghost", () => this.plugin.openEditEntry(item.entry.id), true);
      createButton(actions, t("common.duplicate"), "ghost", () => this.plugin.openDuplicateEntry(item.entry.id), true);
      createButton(actions, t("common.delete"), "ghost", () => this.confirmDeleteEntry(item.entry.id), true);
    }
  }

  private renderDurationOnlySection(entries: TimeEntry[], categoryMap: Map<string, Category>): void {
    const t = this.plugin.t.bind(this.plugin);
    const section = this.contentEl.createDiv({ cls: "time-ledger-section" });
    const sectionHeader = section.createDiv({ cls: "time-ledger-section-header" });
    const titleGroup = sectionHeader.createDiv({ cls: "time-ledger-section-title-group" });
    titleGroup.createEl("h3", { text: t("today.untimed.title") });
    titleGroup.createEl("p", {
      cls: "time-ledger-section-description",
      text: t("today.untimed.description"),
    });

    const list = section.createDiv({ cls: "time-ledger-entry-list" });
    for (const entry of entries) {
      const category = categoryMap.get(entry.categoryId);
      const card = list.createDiv({ cls: "time-ledger-entry-card compact" });
      if (category?.color) {
        card.style.setProperty("--entry-color", category.color);
      }

      const top = card.createDiv({ cls: "time-ledger-entry-card-top" });
      const info = top.createDiv({ cls: "time-ledger-entry-card-main" });
      info.createSpan({ cls: "time-ledger-entry-time", text: getTimeLabel(entry) });
      info.createSpan({ cls: "time-ledger-entry-meta", text: entry.date });
      top.createSpan({ cls: "time-ledger-category-badge", text: category?.name ?? entry.categoryId });

      if (entry.tags.length) {
        card.createDiv({
          cls: "time-ledger-entry-tags",
          text: entry.tags.map((tag) => `#${tag}`).join(" "),
        });
      }

      const noteParts = [entry.project, entry.note].filter(Boolean);
      if (noteParts.length) {
        card.createDiv({ cls: "time-ledger-entry-note", text: noteParts.join(" / ") });
      }

      const actions = card.createDiv({ cls: "time-ledger-entry-actions" });
      createButton(actions, t("common.edit"), "secondary", () => this.plugin.openEditEntry(entry.id), true);
      createButton(actions, t("common.duplicate"), "secondary", () => this.plugin.openDuplicateEntry(entry.id), true);
      createButton(actions, t("common.delete"), "secondary", () => this.confirmDeleteEntry(entry.id), true);
    }
  }

  private renderEmptyState(): void {
    const t = this.plugin.t.bind(this.plugin);
    const empty = this.contentEl.createDiv({ cls: "time-ledger-empty-state" });
    empty.createEl("h3", { text: t("today.empty.title") });
    empty.createEl("p", { text: t("today.empty.description") });
  }
}

function hasTimedRange(entry: TimeEntry): entry is TimeEntry & { startTime: string; endTime: string } {
  return Boolean(entry.startTime && entry.endTime);
}

function getTimedEntries(entries: TimeEntry[]): TimeEntry[] {
  return entries
    .filter((entry) => hasTimedRange(entry))
    .sort((left, right) => minutesFromTimeKey(left.startTime!) - minutesFromTimeKey(right.startTime!));
}

function buildTimelineModel(entries: TimeEntry[], categoryMap: Map<string, Category>): TimelineModel {
  const normalized = entries.map((entry) => {
    const startMinutes = minutesFromTimeKey(entry.startTime!);
    const rawEndMinutes = minutesFromTimeKey(entry.endTime!);
    const endMinutes = rawEndMinutes > startMinutes ? rawEndMinutes : rawEndMinutes + 24 * 60;
    return {
      entry,
      category: categoryMap.get(entry.categoryId),
      startMinutes,
      endMinutes,
    };
  });

  const actualStartMinute = Math.min(...normalized.map((item) => item.startMinutes));
  const actualEndMinute = Math.max(...normalized.map((item) => item.endMinutes));
  const gridStartMinute = Math.floor(actualStartMinute / 60) * 60;
  const gridEndMinute = Math.ceil(actualEndMinute / 60) * 60 + 60;
  const gridHeight = ((gridEndMinute - gridStartMinute) / 60) * HOUR_ROW_HEIGHT;

  const layouts = assignTimelineColumns(normalized).map((item) => {
    const top = ((item.startMinutes - gridStartMinute) / 60) * HOUR_ROW_HEIGHT;
    const proportionalHeight = ((item.endMinutes - item.startMinutes) / 60) * HOUR_ROW_HEIGHT;
    const height = Math.min(
      Math.max(proportionalHeight, MIN_ENTRY_BLOCK_HEIGHT),
      Math.max(gridHeight - top - 4, proportionalHeight),
    );

    return {
      ...item,
      top,
      height,
      density: getEntryDensity(height),
    };
  });

  return {
    actualStartMinute,
    actualEndMinute,
    gridStartMinute,
    gridEndMinute,
    gridHeight,
    entries: layouts,
  };
}

function assignTimelineColumns(
  entries: Array<{
    entry: TimeEntry;
    category?: Category;
    startMinutes: number;
    endMinutes: number;
  }>,
): Array<{
  entry: TimeEntry;
  category?: Category;
  startMinutes: number;
  endMinutes: number;
  column: number;
  columns: number;
}> {
  const result: Array<{
    entry: TimeEntry;
    category?: Category;
    startMinutes: number;
    endMinutes: number;
    column: number;
    columns: number;
  }> = [];

  let group: typeof result = [];
  let groupEndMinute = Number.NEGATIVE_INFINITY;

  const flushGroup = (): void => {
    if (!group.length) {
      return;
    }

    const columnEnds: number[] = [];
    let maxColumns = 0;
    for (const item of group) {
      let column = columnEnds.findIndex((endMinute) => endMinute <= item.startMinutes);
      if (column === -1) {
        column = columnEnds.length;
      }

      columnEnds[column] = item.endMinutes;
      item.column = column;
      maxColumns = Math.max(maxColumns, columnEnds.length);
    }

    for (const item of group) {
      item.columns = maxColumns;
      result.push(item);
    }

    group = [];
    groupEndMinute = Number.NEGATIVE_INFINITY;
  };

  for (const entry of entries) {
    if (group.length && entry.startMinutes >= groupEndMinute) {
      flushGroup();
    }

    const groupItem = {
      ...entry,
      column: 0,
      columns: 1,
    };
    group.push(groupItem);
    groupEndMinute = Math.max(groupEndMinute, entry.endMinutes);
  }

  flushGroup();
  return result;
}

function getEntryDensity(height: number): "normal" | "compact" | "mini" {
  if (height < 60) {
    return "mini";
  }

  if (height < 96) {
    return "compact";
  }

  return "normal";
}

function formatTimelineTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${`${hours}`.padStart(2, "0")}:${`${minutes}`.padStart(2, "0")}`;
}

function getLongestGap(gaps: GapSegment[]): GapSegment | null {
  if (!gaps.length) {
    return null;
  }

  return gaps.reduce((current, gap) => (gap.durationMinutes > current.durationMinutes ? gap : current));
}

function getTimeLabel(entry: TimeEntry): string {
  if (entry.startTime && entry.endTime) {
    return `${entry.startTime}-${entry.endTime}`;
  }

  return formatDuration(entry.durationMinutes);
}

function buildMiniEntryTooltip(entry: TimeEntry, category: Category | undefined, plugin: LiubishevTimeLedgerPlugin): string {
  const lines = [
    `${entry.startTime}-${entry.endTime} · ${formatDuration(entry.durationMinutes)}`,
    category?.name ?? entry.categoryId,
  ];
  const note = [entry.project, entry.note].filter(Boolean).join(" / ");
  if (note) {
    lines.push(note);
  }
  if (entry.tags.length) {
    lines.push(entry.tags.map((tag) => `#${tag}`).join(" "));
  }
  lines.push(plugin.t("today.mini.tooltipHint"));
  return lines.join("\n");
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

function createButton(
  container: HTMLElement,
  text: string,
  variant: "primary" | "secondary" | "ghost",
  handler: () => void | Promise<void>,
  small = false,
): void {
  const button = container.createEl("button", { text });
  button.type = "button";
  button.addClass("time-ledger-button", `time-ledger-button--${variant}`);
  if (variant === "primary") {
    button.addClass("mod-cta");
  }
  if (small) {
    button.addClass("time-ledger-button--small");
  }
  button.addEventListener("click", () => void handler());
}
