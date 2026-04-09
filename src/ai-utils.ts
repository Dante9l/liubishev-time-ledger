export function normalizeChatEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

export function normalizeModelsEndpoint(baseUrl: string): string {
  return normalizeChatEndpoint(baseUrl).replace(/\/chat\/completions$/, "/models");
}

export function extractModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidate = payload as {
    data?: Array<{ id?: string }>;
    models?: Array<{ id?: string }>;
  };

  const items = candidate.data ?? candidate.models ?? [];
  return Array.from(new Set(items
    .map((item) => (typeof item?.id === "string" ? item.id.trim() : ""))
    .filter(Boolean)))
    .sort((left, right) => left.localeCompare(right));
}
