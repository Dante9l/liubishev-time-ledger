import { createTranslator, Locale } from "./i18n.js";
import { formatDuration } from "./time.js";
import { Category, ExportArtifact, PeriodSummary, TimeEntry } from "./types.js";

export function buildSummaryArtifact(summary: PeriodSummary, categories: Category[], locale: Locale = "zh"): ExportArtifact {
  const t = createTranslator(locale);
  const title = t("markdown.summaryTitle", { label: summary.label });
  return {
    title,
    fileName: buildFileName(summary, "summary", locale),
    content: buildSummaryMarkdown(summary, categories, locale),
  };
}

export function buildRawArtifact(summary: PeriodSummary, categories: Category[], locale: Locale = "zh"): ExportArtifact {
  const t = createTranslator(locale);
  const title = t("markdown.rawTitle", { label: summary.label });
  return {
    title,
    fileName: buildFileName(summary, "raw", locale),
    content: buildRawMarkdown(summary.entries, categories, title),
  };
}

export function buildSummaryMarkdown(summary: PeriodSummary, categories: Category[], locale: Locale = "zh"): string {
  const t = createTranslator(locale);
  const title = t("markdown.summaryTitle", { label: summary.label });
  const lines = [
    t("markdown.summaryHeading", { title }),
    "",
    t("markdown.summary.range", { startDate: summary.startDate, endDate: summary.endDate }),
    t("markdown.summary.total", { duration: formatDuration(summary.totalMinutes) }),
    t("markdown.summary.productive", { duration: formatDuration(summary.productiveMinutes) }),
    t("markdown.summary.entries", { count: summary.entryCount }),
    "",
  ];

  if (summary.categorySummaries.length) {
    lines.push(t("markdown.section.categories"), "");
    for (const item of summary.categorySummaries) {
      lines.push(t("markdown.line.category", {
        name: item.name,
        duration: formatDuration(item.totalMinutes),
        count: item.entryCount,
      }));
    }
    lines.push("");
  }

  if (summary.tagSummaries.length) {
    lines.push(t("markdown.section.tags"), "");
    for (const item of summary.tagSummaries.slice(0, 10)) {
      lines.push(t("markdown.line.tag", {
        tag: item.tag,
        duration: formatDuration(item.totalMinutes),
        count: item.entryCount,
      }));
    }
    lines.push("");
  }

  if (summary.gaps.length) {
    lines.push(t("markdown.section.gaps"), "");
    for (const gap of summary.gaps) {
      lines.push(t("markdown.line.gap", {
        start: gap.startTime,
        end: gap.endTime,
        duration: formatDuration(gap.durationMinutes),
      }));
    }
    lines.push("");
  }

  lines.push(t("markdown.section.entries"), "");
  for (const entry of summary.entries) {
    lines.push(formatEntryMarkdown(entry, categories, true));
  }

  return lines.join("\n").trim();
}

export function buildRawMarkdown(
  entries: TimeEntry[],
  categories: Category[],
  title?: string,
  locale: Locale = "zh",
): string {
  const resolvedTitle = title ?? createTranslator(locale)("markdown.rawTitle", { label: "" }).trim();
  const lines = [`## ${resolvedTitle}`, ""];
  for (const entry of entries) {
    lines.push(formatEntryMarkdown(entry, categories, true));
  }
  return lines.join("\n").trim();
}

export function formatEntryMarkdown(entry: TimeEntry, categories: Category[], includeNotes: boolean): string {
  const category = categories.find((item) => item.id === entry.categoryId);
  const categoryName = category?.name ?? entry.categoryId;
  const timeLabel = entry.startTime && entry.endTime
    ? `${entry.startTime}-${entry.endTime}`
    : formatDuration(entry.durationMinutes);
  const tagsLabel = entry.tags.length ? ` ${entry.tags.map((tag) => `#${tag}`).join(" ")}` : "";
  const extras = [
    entry.project.trim(),
    includeNotes ? entry.note.trim() : "",
  ].filter(Boolean);
  const extrasLabel = extras.length ? ` ${extras.join(" / ")}` : "";
  return `- ${entry.date} ${timeLabel} [${categoryName}]${tagsLabel}${extrasLabel}`;
}

function buildFileName(summary: PeriodSummary, kind: "summary" | "raw", locale: Locale): string {
  const t = createTranslator(locale);
  const safeLabel = summary.label.replace(/[^\dA-Za-z\u4e00-\u9fa5-]+/g, "-");
  const suffix = kind === "summary" ? t("markdown.fileSuffix.summary") : t("markdown.fileSuffix.raw");
  return `${safeLabel}-${suffix}.md`;
}
