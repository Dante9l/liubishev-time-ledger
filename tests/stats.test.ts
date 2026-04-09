import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CATEGORIES } from "../src/defaults.js";
import { summarizePeriod } from "../src/stats.js";
import { pickLeafForViewActivation } from "../src/view-activation.js";

test("按天统计分类、标签和空档", () => {
  const summary = summarizePeriod(
    [
      {
        id: "1",
        date: "2026-04-08",
        startTime: "09:00",
        endTime: "10:00",
        durationMinutes: 60,
        categoryId: "study",
        tags: ["数学"],
        project: "",
        note: "",
        source: "manual",
        createdAt: "2026-04-08T00:00:00.000Z",
        updatedAt: "2026-04-08T00:00:00.000Z",
      },
      {
        id: "2",
        date: "2026-04-08",
        startTime: "10:30",
        endTime: "11:00",
        durationMinutes: 30,
        categoryId: "writing",
        tags: ["论文"],
        project: "",
        note: "",
        source: "manual",
        createdAt: "2026-04-08T00:00:00.000Z",
        updatedAt: "2026-04-08T00:00:00.000Z",
      },
    ],
    DEFAULT_CATEGORIES,
    "day",
    "2026-04-08",
  );

  assert.equal(summary.totalMinutes, 90);
  assert.equal(summary.categorySummaries.length, 2);
  assert.equal(summary.tagSummaries.length, 2);
  assert.equal(summary.gaps.length, 1);
  assert.equal(summary.gaps[0]?.durationMinutes, 30);
});

test("已有统计 leaf 时优先复用，不再创建新 leaf", () => {
  const existingLeaf = { id: "stats-1" };
  let createCalled = false;

  const result = pickLeafForViewActivation([existingLeaf], () => {
    createCalled = true;
    return { id: "stats-2" };
  });

  assert.equal(result.leaf, existingLeaf);
  assert.equal(result.reused, true);
  assert.equal(createCalled, false);
});

test("没有统计 leaf 时才创建右侧新 leaf", () => {
  const createdLeaf = { id: "stats-new" };
  let createCalled = false;

  const result = pickLeafForViewActivation([], () => {
    createCalled = true;
    return createdLeaf;
  });

  assert.equal(result.leaf, createdLeaf);
  assert.equal(result.reused, false);
  assert.equal(createCalled, true);
});
