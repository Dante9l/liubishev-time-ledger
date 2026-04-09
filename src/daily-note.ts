import { createTranslator, Locale } from "./i18n.js";
import { Category, DailyNoteSettings, PeriodSummary } from "./types.js";
import { buildSummaryMarkdown } from "./markdown.js";

export function renderDailyNotePath(dateKey: string, settings: DailyNoteSettings): string {
  const fileName = settings.filenameFormat.split("{{date}}").join(dateKey).trim() || dateKey;
  return normalizeMarkdownPath(`${settings.folder}/${fileName}.md`);
}

export function buildDailyNoteBlock(
  summary: PeriodSummary,
  categories: Category[],
  settings: DailyNoteSettings,
  locale: Locale = "zh",
): string {
  const t = createTranslator(locale);
  const heading = settings.heading.trim() || t("defaults.dailyNoteHeading");
  const bodyLines = buildSummaryMarkdown(summary, categories, locale).split("\n");
  if (bodyLines[0]?.startsWith("## ")) {
    bodyLines.shift();
  }
  const normalizedBody = `## ${heading}\n\n${bodyLines.join("\n").trim()}`;
  return wrapLedgerBlock(normalizedBody.trim(), settings.blockId);
}

export function upsertLedgerBlock(markdown: string, nextBlock: string, blockId: string): string {
  const { startMarker, endMarker } = getBlockMarkers(blockId);
  const blockPattern = new RegExp(`${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}`, "m");
  const trimmed = markdown.trimEnd();

  if (blockPattern.test(trimmed)) {
    return trimmed.replace(blockPattern, nextBlock).trimEnd();
  }

  if (!trimmed) {
    return nextBlock;
  }

  return `${trimmed}\n\n${nextBlock}`.trimEnd();
}

export function wrapLedgerBlock(content: string, blockId: string): string {
  const { startMarker, endMarker } = getBlockMarkers(blockId);
  return `${startMarker}\n${content.trim()}\n${endMarker}`;
}

function getBlockMarkers(blockId: string): { startMarker: string; endMarker: string } {
  const safeId = blockId.trim() || "liubishev-time-ledger";
  return {
    startMarker: `<!-- ${safeId}:start -->`,
    endMarker: `<!-- ${safeId}:end -->`,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeMarkdownPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\.\//, "");
}
