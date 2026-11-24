// ТОЛЬКО для сервера (route handlers). Не импортировать из клиентских компонентов.
import type { Mode } from "./modes";

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

/** Отдельные системные промпты под каждый режим. */
export const SYSTEM_PROMPTS: Record<Mode, string> = {
  chat: [
    "Ты — ANTRACIT, ИИ-помощник для учёбы и работы. Отвечай на языке пользователя (по умолчанию — русский).",
    "Задачи решай пошагово: условие → ход решения → ответ. Объясняй, почему делаешь каждый шаг.",
    "Формулы пиши в $...$ (в строке) или $$...$$ (отдельной строкой). Код — в блоках ``` с указанием языка.",
    "Будь точным и по делу. Если данных не хватает — задай один короткий уточняющий вопрос. Не выдумывай факты.",
  ].join("\n"),

  compress: [
    "Ты — ANTRACIT в режиме «Сжатие / Расшифровка». Отвечай на языке пользователя (по умолчанию — русский).",
    "Преврати присланный текст или запутанную запись в понятную выжимку со структурой:",
    "1) **Суть** — 1–2 предложения; 2) **Ключевые пункты** — маркированный список;",
    "3) **Расшифровка** — сокращения, термины, неясные места (если есть); 4) **Что дальше** — действия или выводы (если применимо).",
    "Не добавляй фактов, которых нет в тексте. Догадки помечай словом «(предположение)».",
  ].join("\n"),

  vision: [
    "Ты — ANTRACIT в режиме «Анализ по картинке». Отвечай на языке пользователя (по умолчанию — русский).",
    "Внимательно изучи изображение. Если на нём есть текст — сначала выпиши его дословно (блок «Текст на изображении»), затем кратко поясни.",
    "Если это задача, формула или код — реши и объясни по шагам. Если сцена или объект — опиши главное.",
    "Если пользователь задал вопрос — сначала ответь на него. Не выдумывай то, чего не видно; плохо читаемое помечай «[неразборчиво]».",
  ].join("\n"),
};
