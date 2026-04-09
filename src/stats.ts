import { createTranslator, Locale } from "./i18n.js";
import { formatDuration, minutesFromTimeKey, parseDateKey, shiftDateKey } from "./time.js";
import { Category, CategorySummary, GapSegment, PeriodSummary, StatsPeriod, TagSummary, TimeEntry } from "./types.js";

export function getPeriodBounds(period: StatsPeriod, referenceDate: string): { startDate: string; endDate: string } {
  if (period === "day") {
    return { startDate: referenceDate, endDate: referenceDate };
  }

  const base = parseDateKey(referenceDate);
  if (period === "week") {
    const dayOffset = (base.getDay() + 6) % 7;
    const startDate = shiftDateKey(referenceDate, -dayOffset);
    const endDate = shiftDateKey(startDate, 6);
    return { startDate, endDate };
  }

  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

export function summarizePeriod(
  entries: TimeEntry[],
  categories: Category[],
  period: StatsPeriod,
  referenceDate: string,
  locale: Locale = "zh",
): PeriodSummary {
  const bounds = getPeriodBounds(period, referenceDate);
  const filteredEntries = entries.filter((entry) => entry.date >= bounds.startDate && entry.date <= bounds.endDate);
  const categorySummaries = summarizeCategories(filteredEntries, categories);
  const tagSummaries = summarizeTags(filteredEntries);
  const productiveMinutes = categorySummaries.reduce((sum, item) => sum + item.productiveMinutes, 0);
  const totalMinutes = filteredEntries.reduce((sum, item) => sum + item.durationMinutes, 0);

  return {
    period,
    label: buildPeriodLabel(period, bounds.startDate, bounds.endDate, locale),
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    totalMinutes,
    productiveMinutes,
    entryCount: filteredEntries.length,
    categorySummaries,
    tagSummaries,
    gaps: period === "day" ? findDailyGaps(filteredEntries) : [],
    entries: filteredEntries,
  };
}

export function buildSummaryHighlights(summary: PeriodSummary, locale: Locale = "zh"): string[] {
  const t = createTranslator(locale);
  const lines = [
    t("stats.highlight.total", { duration: formatDuration(summary.totalMinutes) }),
    t("stats.highlight.productive", { duration: formatDuration(summary.productiveMinutes) }),
    t("stats.highlight.entries", { count: summary.entryCount }),
  ];

  if (summary.gaps.length) {
    lines.push(t("stats.highlight.gaps", { count: summary.gaps.length }));
  }

  return lines;
}

function summarizeCategories(entries: TimeEntry[], categories: Category[]): CategorySummary[] {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const bucket = new Map<string, CategorySummary>();

  for (const entry of entries) {
    const category = categoryMap.get(entry.categoryId);
    const name = category?.name ?? entry.categoryId;
    const color = category?.color ?? "#64748b";
    const productiveMinutes = category?.isProductive ? entry.durationMinutes : 0;
    const current = bucket.get(entry.categoryId) ?? {
      categoryId: entry.categoryId,
      name,
      color,
      totalMinutes: 0,
      entryCount: 0,
      productiveMinutes: 0,
    };

    current.totalMinutes += entry.durationMinutes;
    current.entryCount += 1;
    current.productiveMinutes += productiveMinutes;
    bucket.set(entry.categoryId, current);
  }

  return Array.from(bucket.values()).sort((left, right) => right.totalMinutes - left.totalMinutes);
}

function summarizeTags(entries: TimeEntry[]): TagSummary[] {
  const bucket = new Map<string, TagSummary>();
  for (const entry of entries) {
    for (const tag of entry.tags) {
      const current = bucket.get(tag) ?? { tag, totalMinutes: 0, entryCount: 0 };
      current.totalMinutes += entry.durationMinutes;
      current.entryCount += 1;
      bucket.set(tag, current);
    }
  }

  return Array.from(bucket.values()).sort((left, right) => right.totalMinutes - left.totalMinutes);
}

function findDailyGaps(entries: TimeEntry[]): GapSegment[] {
  const timedEntries = entries
    .filter((entry) => entry.startTime && entry.endTime)
    .sort((left, right) => minutesFromTimeKey(left.startTime!) - minutesFromTimeKey(right.startTime!));

  const gaps: GapSegment[] = [];
  for (let index = 1; index < timedEntries.length; index += 1) {
    const previous = timedEntries[index - 1];
    const current = timedEntries[index];
    if (!previous?.endTime || !current?.startTime) {
      continue;
    }

    const start = minutesFromTimeKey(previous.endTime);
    const end = minutesFromTimeKey(current.startTime);
    if (end > start) {
      gaps.push({
        startTime: previous.endTime,
        endTime: current.startTime,
        durationMinutes: end - start,
      });
    }
  }

  return gaps;
}

function buildPeriodLabel(period: StatsPeriod, startDate: string, endDate: string, locale: Locale): string {
  if (period === "day") {
    return startDate;
  }

  if (period === "week") {
    const t = createTranslator(locale);
    return `${startDate} ${t("stats.period.rangeSeparator")} ${endDate}`;
  }

  return startDate.slice(0, 7);
}

function formatDate(date: Date): string {
  return [
    date.getFullYear(),
    `${date.getMonth() + 1}`.padStart(2, "0"),
    `${date.getDate()}`.padStart(2, "0"),
  ].join("-");
}
