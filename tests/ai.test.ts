import assert from "node:assert/strict";
import test from "node:test";
import { extractModelIds, normalizeModelsEndpoint } from "../src/ai-utils.js";

test("模型列表接口会从 chat completions 端点推导", () => {
  assert.equal(
    normalizeModelsEndpoint("https://example.com/v1/chat/completions"),
    "https://example.com/v1/models",
  );
  assert.equal(
    normalizeModelsEndpoint("https://example.com/v1"),
    "https://example.com/v1/models",
  );
});

test("模型列表会去重并按 id 提取", () => {
  assert.deepEqual(extractModelIds({
    data: [
      { id: "gpt-4.1-mini" },
      { id: "gpt-4.1" },
      { id: "gpt-4.1-mini" },
    ],
  }), ["gpt-4.1", "gpt-4.1-mini"]);
});
