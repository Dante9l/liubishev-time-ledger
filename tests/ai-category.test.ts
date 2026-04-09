import assert from "node:assert/strict";
import test from "node:test";
import { parseCategorySuggestionResponse } from "../src/ai-category.js";

test("可解析纯 JSON 的 AI 分类建议", () => {
  const suggestion = parseCategorySuggestionResponse(
    '{"categoryId":"study","tags":["数学","线代"],"reason":"与历史学习记录相似","confidence":"high"}',
    ["study", "writing"],
  );

  assert.equal(suggestion.categoryId, "study");
  assert.deepEqual(suggestion.tags, ["数学", "线代"]);
  assert.equal(suggestion.confidence, "high");
  assert.equal(suggestion.source, "ai");
});

test("可解析带代码块的 AI 分类建议", () => {
  const suggestion = parseCategorySuggestionResponse(
    '```json\n{"categoryId":"writing","tags":["周报"],"reason":"备注明确提到写作","confidence":"medium"}\n```',
    ["study", "writing"],
  );

  assert.equal(suggestion.categoryId, "writing");
  assert.deepEqual(suggestion.tags, ["周报"]);
  assert.equal(suggestion.confidence, "medium");
});

test("无效分类会抛错", () => {
  assert.throws(() => parseCategorySuggestionResponse(
    '{"categoryId":"unknown","tags":[],"reason":"test","confidence":"low"}',
    ["study", "writing"],
  ));
});
