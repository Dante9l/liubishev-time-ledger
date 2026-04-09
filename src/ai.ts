import { requestUrl } from "obsidian";
import { parseCategorySuggestionResponse } from "./ai-category.js";
import { createTranslator, Locale } from "./i18n.js";
import { AISettings, CategorySuggestion } from "./types.js";

export interface AIReviewContext {
  periodLabel: string;
  summaryMarkdown: string;
  rawMarkdown: string;
}

export interface AICategoryContext {
  project: string;
  note: string;
  tags: string[];
  categories: Array<{ id: string; name: string }>;
  localSuggestion: CategorySuggestion | null;
  relatedEntries: Array<{
    categoryName: string;
    project: string;
    note: string;
    tags: string[];
  }>;
}

export function canUseAI(settings: AISettings): boolean {
  return settings.enabled && Boolean(settings.baseUrl.trim()) && Boolean(settings.apiKey.trim()) && Boolean(settings.model.trim());
}

export async function generateAIReview(settings: AISettings, context: AIReviewContext, locale: Locale = "zh"): Promise<string> {
  const t = createTranslator(locale);
  const text = await requestAIText(settings, {
    temperature: 0.4,
    systemPrompt: t("ai.review.systemPrompt"),
    userPrompt: buildReviewPrompt(context, locale),
  }, locale);
  if (!text) {
    throw new Error(t("ai.error.emptyResponse"));
  }

  return text.trim();
}

export async function suggestCategoryWithAI(
  settings: AISettings,
  context: AICategoryContext,
  locale: Locale = "zh",
): Promise<CategorySuggestion> {
  const t = createTranslator(locale);
  const text = await requestAIText(settings, {
    temperature: 0.2,
    systemPrompt: t("ai.category.systemPrompt"),
    userPrompt: buildCategoryPrompt(context, locale),
  }, locale);
  if (!text) {
    throw new Error(t("ai.error.emptyResponse"));
  }

  return parseCategorySuggestionResponse(text, context.categories.map((item) => item.id), locale);
}

function normalizeEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

function buildReviewPrompt(context: AIReviewContext, locale: Locale): string {
  const t = createTranslator(locale);
  return [
    t("ai.review.request", { periodLabel: context.periodLabel }),
    "",
    t("ai.prompt.summaryHeading"),
    context.summaryMarkdown,
    "",
    t("ai.prompt.rawHeading"),
    context.rawMarkdown,
    "",
    t("ai.prompt.outputFormat"),
    t("ai.prompt.overview"),
    t("ai.prompt.findings"),
    t("ai.prompt.actions"),
  ].join("\n");
}

function buildCategoryPrompt(context: AICategoryContext, locale: Locale): string {
  const t = createTranslator(locale);
  const categoryLines = context.categories.map((item) => `- ${item.id}: ${item.name}`).join("\n");
  const historyLines = context.relatedEntries.length
    ? context.relatedEntries
        .map((item) => `- [${item.categoryName}] ${item.project || "-"} / ${item.note || "-"} / ${item.tags.map((tag) => `#${tag}`).join(" ") || "-"}`)
        .join("\n")
    : t("ai.category.none");

  return [
    t("ai.category.request"),
    "",
    t("ai.category.availableCategories"),
    categoryLines,
    "",
    t("ai.category.currentInput"),
    t("ai.category.field.project", { value: context.project || "-" }),
    t("ai.category.field.note", { value: context.note || "-" }),
    t("ai.category.field.tags", { value: context.tags.length ? context.tags.map((tag) => `#${tag}`).join(" ") : "-" }),
    "",
    t("ai.category.localSuggestion"),
    context.localSuggestion
      ? `${context.localSuggestion.categoryId} / ${context.localSuggestion.confidence} / ${context.localSuggestion.reason}`
      : t("ai.category.none"),
    "",
    t("ai.category.history"),
    historyLines,
    "",
    t("ai.category.jsonOnly"),
    t("ai.category.sampleJson"),
  ].join("\n");
}

async function requestAIText(
  settings: AISettings,
  prompt: { temperature: number; systemPrompt: string; userPrompt: string },
  locale: Locale,
): Promise<string> {
  const t = createTranslator(locale);
  if (!canUseAI(settings)) {
    throw new Error(t("error.enableAiFirst"));
  }

  const response = await requestUrl({
    url: normalizeEndpoint(settings.baseUrl),
    method: "POST",
    throw: false,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: prompt.temperature,
      messages: [
        { role: "system", content: prompt.systemPrompt },
        { role: "user", content: prompt.userPrompt },
      ],
    }),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(t("ai.error.requestFailed", { status: response.status }));
  }

  return extractContent(response.json)?.trim() ?? "";
}

function extractContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const json = payload as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  };

  const content = json.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item.text === "string" ? item.text : ""))
      .join("")
      .trim();
  }

  return null;
}
