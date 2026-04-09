import assert from "node:assert/strict";
import test from "node:test";
import { buildSuggestedTimeInput, formatTimeInputForEntry, inferTimeInputStyle, parseTimeInput, splitEntryAcrossMidnight } from "../src/time.js";

test("支持紧凑时间段输入", () => {
  const result = parseTimeInput("0910-1040");
  assert.equal(result.mode, "range");
  assert.equal(result.startTime, "09:10");
  assert.equal(result.endTime, "10:40");
  assert.equal(result.durationMinutes, 90);
});

test("支持单个时间点配合默认结束时间", () => {
  const result = parseTimeInput("0910", { defaultEndTime: "10:40" });
  assert.equal(result.startTime, "09:10");
  assert.equal(result.endTime, "10:40");
  assert.equal(result.durationMinutes, 90);
});

test("支持时长输入", () => {
  const result = parseTimeInput("1h30m");
  assert.equal(result.mode, "duration");
  assert.equal(result.durationMinutes, 90);
});

test("跨午夜记录会被拆分", () => {
  const entries = splitEntryAcrossMidnight({
    id: "entry-1",
    date: "2026-04-08",
    startTime: "23:30",
    endTime: "01:00",
    durationMinutes: 90,
    categoryId: "study",
    tags: [],
    project: "",
    note: "",
    source: "manual",
    createdAt: "2026-04-08T10:00:00.000Z",
    updatedAt: "2026-04-08T10:00:00.000Z",
  });

  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.endTime, "24:00");
  assert.equal(entries[1]?.date, "2026-04-09");
  assert.equal(entries[1]?.startTime, "00:00");
});

test("新增默认时间会继承上一条的紧凑区间格式", () => {
  const value = buildSuggestedTimeInput([
    {
      id: "1",
      date: "2026-04-09",
      startTime: "09:10",
      endTime: "10:40",
      durationMinutes: 90,
      timeInputStyle: "range_compact",
      categoryId: "study",
      tags: [],
      project: "",
      note: "",
      source: "manual",
      createdAt: "2026-04-09T00:00:00.000Z",
      updatedAt: "2026-04-09T00:00:00.000Z",
    },
  ], "2026-04-09", 30, new Date("2026-04-09T11:00:00.000Z"));

  assert.equal(value, "1040-1110");
});

test("新增默认时间会继承上一条的时长格式", () => {
  const value = buildSuggestedTimeInput([
    {
      id: "1",
      date: "2026-04-09",
      durationMinutes: 90,
      timeInputStyle: "duration_minutes",
      categoryId: "study",
      tags: [],
      project: "",
      note: "",
      source: "manual",
      createdAt: "2026-04-09T00:00:00.000Z",
      updatedAt: "2026-04-09T00:00:00.000Z",
    },
  ], "2026-04-09", 30, new Date("2026-04-09T11:00:00.000Z"));

  assert.equal(value, "30m");
});

test("编辑记录时会按原时间格式回填", () => {
  assert.equal(inferTimeInputStyle("0910-1040"), "range_compact");
  assert.equal(formatTimeInputForEntry({
    startTime: "09:10",
    endTime: "10:40",
    durationMinutes: 90,
    timeInputStyle: "range_compact",
  }), "0910-1040");
});
