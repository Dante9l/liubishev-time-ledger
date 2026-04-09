import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultData } from "../src/defaults.js";
import { resolveLocale } from "../src/i18n.js";
import { buildSummaryMarkdown } from "../src/markdown.js";
import { summarizePeriod } from "../src/stats.js";

test("按 Obsidian 语言代码解析本地化语言", () => {
  assert.equal(resolveLocale("zh-CN"), "zh");
  assert.equal(resolveLocale("en-US"), "en");
  assert.equal(resolveLocale("fr"), "en");
  assert.equal(resolveLocale(""), "en");
});

test("英文默认数据使用英文分类与标题", () => {
  const data = createDefaultData("en");
  assert.equal(data.settings.categories[0]?.name, "Study");
  assert.equal(data.settings.dailyNote.heading, "Time Ledger");
});

test("英文 Markdown 导出使用英文标题", () => {
  const defaults = createDefaultData("en");
  const summary = summarizePeriod(
    [
      {
        id: "1",
        date: "2026-04-08",
        startTime: "09:00",
        endTime: "10:00",
        durationMinutes: 60,
        categoryId: "study",
        tags: ["math"],
        project: "",
        note: "",
        source: "manual",
        createdAt: "2026-04-08T00:00:00.000Z",
        updatedAt: "2026-04-08T00:00:00.000Z",
      },
    ],
    defaults.settings.categories,
    "day",
    "2026-04-08",
    "en",
  );

  const markdown = buildSummaryMarkdown(summary, defaults.settings.categories, "en");
  assert.match(markdown, /Time Review/);
  assert.match(markdown, /Range:/);
  assert.match(markdown, /Category Breakdown/);
});
