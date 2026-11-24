// ТОЛЬКО сервер. Защита от «долбёжки»: не больше N запросов в минуту с одного пользователя и IP.
// Дневной лимит (quota.ts) бережёт бесплатные запросы, а этот — ключи от скриптов и случайных повторов.
// Хранится в памяти процесса: на serverless это «мягкая» защита, но от быстрых очередей запросов помогает.

const WINDOW_MS = 60_000;

const g = globalThis as unknown as { __antracitBurst?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__antracitBurst ??= new Map());

function limitPerMinute(): number {
  const n = Number(process.env.MAX_REQUESTS_PER_MINUTE);
  return Number.isFinite(n) && n > 0 ? n : 8;
}

/** Возвращает, через сколько секунд можно снова (0 — можно сейчас), и учитывает запрос, если можно. */
export function burstCheck(keys: string[]): number {
  const now = Date.now();
  const limit = limitPerMinute();
  if (hits.size > 10_000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > WINDOW_MS) hits.delete(k);

  let wait = 0;
  for (const k of keys) {
    const list = (hits.get(k) ?? []).filter((t) => now - t < WINDOW_MS);
    hits.set(k, list);
    // на IP лимит мягче: за одним Wi-Fi может сидеть целый класс
    const cap = k.startsWith("ip:") ? limit * 4 : limit;
    if (list.length >= cap) wait = Math.max(wait, Math.ceil((WINDOW_MS - (now - list[0])) / 1000));
  }
  if (wait > 0) return wait;
  for (const k of keys) hits.get(k)!.push(now);
  return 0;
}
