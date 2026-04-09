import { createTranslator, Locale } from "./i18n.js";
import { Category, CategorySuggestion, TimeEntry } from "./types.js";

const TOKEN_SPLIT = /[\s,，。；;、?\-_\n\r\t]+/;

export function suggestCategory(
  input: { project?: string; note?: string; tags?: string[] },
  categories: Category[],
  entries: TimeEntry[],
  locale: Locale = "zh",
): CategorySuggestion | null {
  const t = createTranslator(locale);
  const listSeparator = locale === "zh" ? "、" : ", ";
  const rawText = [input.project ?? "", input.note ?? "", ...(input.tags ?? [])].join(" ").trim();
  const tokens = tokenize(rawText);
  if (!rawText) {
    return null;
  }

  const scored = new Map<string, { score: number; reasons: string[] }>();
  for (const category of categories.filter((item) => item.enabled)) {
    scored.set(category.id, { score: 0, reasons: [] });

    if (containsCategoryName(rawText, category.name)) {
      const current = scored.get(category.id)!;
      current.score += 10;
      current.reasons.push(t("categorySuggest.reason.containsCategoryName", { name: category.name }));
    }
  }

  const inputTagSet = new Set((input.tags ?? []).map(normalizeToken).filter(Boolean));
  for (const entry of entries) {
    const bucket = scored.get(entry.categoryId);
    if (!bucket) {
      continue;
    }

    let score = 0;
    const overlapTokens = intersect(tokens, tokenize([entry.project, entry.note, ...entry.tags].join(" ")));
    if (overlapTokens.length) {
      score += overlapTokens.length * 2;
      bucket.reasons.push(t("categorySuggest.reason.historyHit", { tokens: overlapTokens.slice(0, 3).join(listSeparator) }));
    }

    if (input.project && entry.project && normalizeToken(input.project) === normalizeToken(entry.project)) {
      score += 5;
      bucket.reasons.push(t("categorySuggest.reason.projectMatch", { project: entry.project }));
    }

    const tagMatches = entry.tags.filter((tag) => inputTagSet.has(normalizeToken(tag)));
    if (tagMatches.length) {
      score += tagMatches.length * 4;
      bucket.reasons.push(t("categorySuggest.reason.tagHit", { tags: tagMatches.slice(0, 3).join(listSeparator) }));
    }

    bucket.score += score;
  }

  const ranked = Array.from(scored.entries())
    .map(([categoryId, item]) => ({
      categoryId,
      score: item.score,
      reason: dedupeReasons(item.reasons).slice(0, 2).join(locale === "zh" ? "；" : "; "),
    }))
    .sort((left, right) => right.score - left.score);

  const top = ranked[0];
  if (!top || top.score <= 0) {
    return null;
  }

  return {
    categoryId: top.categoryId,
    score: top.score,
    confidence: top.score >= 10 ? "high" : top.score >= 5 ? "medium" : "low",
    reason: top.reason || t("categorySuggest.reason.fallback"),
    source: "local",
    tags: [],
  };
}

function tokenize(text: string): string[] {
  return Array.from(new Set(
    text
      .toLowerCase()
      .split(TOKEN_SPLIT)
      .map(normalizeToken)
      .filter((token) => token.length >= 2),
  ));
}

function normalizeToken(token: string): string {
  return token.trim().replace(/^#/, "").toLowerCase();
}

function intersect(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((token) => rightSet.has(token));
}

function containsCategoryName(rawText: string, categoryName: string): boolean {
  return rawText.toLowerCase().includes(categoryName.trim().toLowerCase());
}

function dedupeReasons(reasons: string[]): string[] {
  return Array.from(new Set(reasons.filter(Boolean)));
}
