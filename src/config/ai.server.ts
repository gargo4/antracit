// ТОЛЬКО для сервера (route handlers). Не импортировать из клиентских компонентов.

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.trim() ? raw.trim() : fallback;
}

/** Провайдер и модель. Меняются через .env, код трогать не нужно. */
function list(name: string): string[] {
  return (process.env[name] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

// По умолчанию — Google Gemini через OpenAI-совместимый эндпоинт.
const DEFAULT_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"];

export function getAiConfig() {
  // Цепочка моделей: если первая недоступна (403/404/лимит/сбой) — берётся следующая.
  const models = list("AI_MODELS").length ? list("AI_MODELS") : list("AI_MODEL").length ? list("AI_MODEL") : DEFAULT_MODELS;
  const visionModels = list("AI_VISION_MODELS").length ? list("AI_VISION_MODELS") : list("AI_VISION_MODEL").length ? list("AI_VISION_MODEL") : models;
  const extraHeaders: Record<string, string> = {};
  const referer = process.env.AI_HTTP_REFERER?.trim();
  if (referer) extraHeaders["HTTP-Referer"] = referer;
  const title = process.env.AI_APP_TITLE?.trim();
  if (title) extraHeaders["X-Title"] = title;

  return {
    baseUrl: str("AI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/+$/, ""),
    models,
    visionModels,
    model: models[0],
    maxOutputTokens: num("AI_MAX_OUTPUT_TOKENS", 2048),
    temperature: num("AI_TEMPERATURE", 0.4),
    extraHeaders,
  };
}

/** Лимиты: бесплатные запросы и размеры, чтобы нельзя было слить квоту одним запросом. */
export function getLimits() {
  return {
    freePerDay: num("FREE_REQUESTS_PER_DAY", 15), // 0 = без ограничений
    maxTextChars: num("MAX_TEXT_CHARS", 8000),
    maxImageBytes: num("MAX_IMAGE_BYTES", 1_500_000),
    maxHistory: Math.max(1, num("MAX_HISTORY_MESSAGES", 10)),
    maxHistoryItemChars: 4000, // старые сообщения в контексте режутся до этого размера
  };
}

export { SYSTEM_PROMPTS } from "./prompts";
