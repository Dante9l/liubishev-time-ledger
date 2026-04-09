import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CATEGORIES } from "../src/defaults.js";
import { buildDailyNoteBlock, renderDailyNotePath, upsertLedgerBlock } from "../src/daily-note.js";
import { summarizePeriod } from "../src/stats.js";

test("Daily Note 路径可根据日期模板渲染", () => {
  const path = renderDailyNotePath("2026-04-08", {
    enabled: true,
    folder: "Daily",
    filenameFormat: "{{date}}",
    heading: "时间账本",
    blockId: "time-ledger",
  });
  assert.equal(path, "Daily/2026-04-08.md");
});

test("Daily Note 区块支持覆盖更新", () => {
  const original = "# 2026-04-08\n\n<!-- time-ledger:start -->\n旧内容\n<!-- time-ledger:end -->";
  const next = upsertLedgerBlock(original, "<!-- time-ledger:start -->\n新内容\n<!-- time-ledger:end -->", "time-ledger");
  assert.match(next, /新内容/);
  assert.doesNotMatch(next, /旧内容/);
});

test("Daily Note 区块可由当日统计生成", () => {
  const summary = summarizePeriod([
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
  ], DEFAULT_CATEGORIES, "day", "2026-04-08");

  const block = buildDailyNoteBlock(summary, DEFAULT_CATEGORIES, {
    enabled: true,
    folder: "Daily",
    filenameFormat: "{{date}}",
    heading: "时间账本",
    blockId: "time-ledger",
  });

  assert.match(block, /时间账本/);
  assert.match(block, /09:00-10:00/);
});
