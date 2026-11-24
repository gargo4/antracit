// ТОЛЬКО сервер. Пул из 3 API-ключей × цепочка моделей: ручной выбор + автоматическая ротация.
import { KEY_LABELS } from "../config/modes";

const ENV_NAMES = ["AI_KEY_1", "AI_KEY_2", "AI_KEY_3"] as const;

type State = {
  slotCooldown: number[]; // ключ целиком (невалиден / кончились деньги)
  pairCooldown: Map<string, number>; // "слот:модель" (403/404/429/5xx на конкретной модели)
};

const g = globalThis as unknown as { __antracitKeys?: State };
const state: State = (g.__antracitKeys ??= { slotCooldown: [0, 0, 0], pairCooldown: new Map() });

export function getKey(slot: number): string | null {
  const name = ENV_NAMES[slot];
  if (!name) return null;
  const v = process.env[name]?.trim();
  if (!v || /^(your|ваш|sk-\.\.\.|xxx)/i.test(v)) return null;
  return v;
}

export function configuredSlots(): number[] {
  return [0, 1, 2].filter((s) => getKey(s) !== null);
}

/** Публичный статус слотов — БЕЗ самих ключей. */
export function slotStatuses() {
  const now = Date.now();
  return [0, 1, 2].map((slot) => {
    const configured = getKey(slot) !== null;
    const left = Math.max(0, state.slotCooldown[slot] - now);
    return { slot, label: KEY_LABELS[slot], configured, available: configured && left === 0, cooldownSec: Math.ceil(left / 1000) };
  });
}

/** Порядок перебора ключей (выбранный вручную — первым; «отдыхающие» — в конец). */
export function orderedSlots(preferred: number | "auto", fallback: boolean): number[] {
  const configured = configuredSlots();
  let order = configured;
  if (preferred !== "auto" && configured.includes(preferred)) {
    order = [preferred, ...configured.filter((s) => s !== preferred)];
    if (!fallback) order = order.slice(0, 1);
  }
  const now = Date.now();
  return [...order.filter((s) => state.slotCooldown[s] <= now), ...order.filter((s) => state.slotCooldown[s] > now)];
}

const pairKey = (slot: number, model: string) => `${slot}:${model}`;

export function isReady(slot: number, model: string): boolean {
  const now = Date.now();
  return state.slotCooldown[slot] <= now && (state.pairCooldown.get(pairKey(slot, model)) ?? 0) <= now;
}

/** Нужно ли пробовать другой ключ/модель при таком ответе провайдера. */
export function shouldRotate(status: number): boolean {
  return status === 401 || status === 402 || status === 403 || status === 404 || status === 408 || status === 429 || status >= 500;
}

/** Помечаем пару ключ+модель (или ключ целиком) как проблемную. */
export function markFailure(slot: number, model: string, status: number, body: string, retryAfterSec?: number) {
  const now = Date.now();
  const exhausted = /insufficient_quota|billing|exceeded your current quota|credit|balance|RESOURCE_EXHAUSTED.*(quota|billing)/i.test(body);

  if (status === 401 || status === 402 || (status === 429 && exhausted)) {
    state.slotCooldown[slot] = now + 30 * 60_000; // ключ целиком
    return;
  }
  let ms = 20_000; // 5xx / сеть
  if (status === 403 || status === 404) ms = 30 * 60_000; // модель недоступна этому ключу
  else if (status === 429) ms = Math.min(Math.max((retryAfterSec ?? 60) * 1000, 15_000), 10 * 60_000);
  state.pairCooldown.set(pairKey(slot, model), now + ms);
}

export function markSuccess(slot: number, model?: string) {
  state.slotCooldown[slot] = 0;
  if (model) state.pairCooldown.delete(pairKey(slot, model));
  else for (const k of [...state.pairCooldown.keys()]) if (k.startsWith(`${slot}:`)) state.pairCooldown.delete(k);
}
