import assert from "node:assert/strict";
import test from "node:test";
import { suggestCategory } from "../src/category-suggest.js";
import { DEFAULT_CATEGORIES } from "../src/defaults.js";

test("根据标签和历史记录给出学习分类建议", () => {
  const suggestion = suggestCategory({
    project: "线代第二章",
    note: "整理视频课笔记",
    tags: ["数学", "线代"],
  }, DEFAULT_CATEGORIES, [
    {
      id: "1",
      date: "2026-04-01",
      startTime: "09:00",
      endTime: "10:00",
      durationMinutes: 60,
      categoryId: "study",
      tags: ["数学"],
      project: "线代第二章",
      note: "刷题",
      source: "manual",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
    },
  ]);

  assert.equal(suggestion?.categoryId, "study");
  assert.ok((suggestion?.score ?? 0) > 0);
  assert.equal(suggestion?.source, "local");
});

test("文本包含分类名时优先推荐对应分类", () => {
  const suggestion = suggestCategory({
    project: "",
    note: "今天继续写作周报",
    tags: [],
  }, DEFAULT_CATEGORIES, []);

  assert.equal(suggestion?.categoryId, "writing");
  assert.equal(suggestion?.confidence, "high");
  assert.deepEqual(suggestion?.tags, []);
});
