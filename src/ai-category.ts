import { createTranslator, Locale } from "./i18n.js";
import { CategorySuggestion } from "./types.js";

type ParsedCategorySuggestion = Partial<{
  categoryId: string;
  tags: string[];
  reason: string;
  confidence: "high" | "medium" | "low";
}>;

export function parseCategorySuggestionResponse(
  text: string,
  validCategoryIds: string[],
  locale: Locale = "zh",
): CategorySuggestion {
  const t = createTranslator(locale);
  const raw = extractJSONObject(text, locale);
  const parsed: ParsedCategorySuggestion = JSON.parse(raw);
  const categoryId = String(parsed.categoryId ?? "");
  if (!validCategoryIds.includes(categoryId)) {
    throw new Error(t("aiCategory.error.invalidCategory"));
  }

  return {
    categoryId,
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((item) => String(item).trim()).filter(Boolean).slice(0, 5) : [],
    reason: String(parsed.reason ?? t("aiCategory.error.noReason")),
    confidence: normalizeConfidence(parsed.confidence),
    score: scoreFromConfidence(parsed.confidence),
    source: "ai",
  };
}

function extractJSONObject(text: string, locale: Locale): string {
  const t = createTranslator(locale);
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(t("aiCategory.error.invalidJson"));
  }

  return cleaned.slice(start, end + 1);
}

function normalizeConfidence(value: unknown): "high" | "medium" | "low" {
  return value === "high" || value === "medium" ? value : "low";
}

function scoreFromConfidence(value: unknown): number {
  if (value === "high") {
    return 12;
  }

  if (value === "medium") {
    return 7;
  }

  return 3;
}
