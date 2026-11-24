// ТОЛЬКО сервер. Счётчик бесплатных запросов (в сутки) на пользователя.
//
// Хранилище выбирается автоматически:
//  • заданы UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN → Upstash Redis (надёжно на Vercel/serverless);
//  • иначе → память процесса (достаточно для одного сервера `next start`).
// Без внешних зависимостей: Upstash вызывается через его REST API.
import { getLimits } from "../config/ai.server";

const DAY_TTL_SEC = 60 * 60 * 36;
const today = () => new Date().toISOString().slice(0, 10);

// ── хранилища ─────────────────────────────────────────────────────
interface Store {
  get(keys: string[]): Promise<number[]>;
  incr(keys: string[], by: number): Promise<void>;
}

type Entry = { day: string; count: number };
const g = globalThis as unknown as { __antracitQuota?: Map<string, Entry> };
const mem: Map<string, Entry> = (g.__antracitQuota ??= new Map());

const memoryStore: Store = {
  async get(keys) {
    const day = today();
    return keys.map((k) => {
      const e = mem.get(k);
      return e && e.day === day ? e.count : 0;
    });
  },
  async incr(keys, by) {
    const day = today();
    if (mem.size > 5000) for (const [k, v] of mem) if (v.day !== day) mem.delete(k);
    for (const k of keys) {
      const e = mem.get(k);
      const count = e && e.day === day ? e.count : 0;
      mem.set(k, { day, count: Math.max(0, count + by) });
    }
  },
};

function upstashStore(url: string, token: string): Store {
  const call = async (commands: (string | number)[][]) => {
    const res = await fetch(`${url.replace(/\/+$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
    return (await res.json()) as { result?: unknown; error?: string }[];
  };
  return {
    async get(keys) {
      const out = await call(keys.map((k) => ["GET", k]));
      return out.map((r) => Number(r?.result ?? 0) || 0);
    },
    async incr(keys, by) {
      await call(keys.flatMap((k) => [["INCRBY", k, by], ["EXPIRE", k, DAY_TTL_SEC]]));
    },
  };
}

function store(): Store {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? upstashStore(url, token) : memoryStore;
}

/** Если Redis недоступен — не роняем чат, а временно считаем в памяти. */
async function safe<T>(fn: (s: Store) => Promise<T>): Promise<T> {
  const s = store();
  if (s === memoryStore) return fn(s);
  try {
    return await fn(s);
  } catch (e) {
    console.error("[antracit] quota store failed, using memory:", e);
    return fn(memoryStore);
  }
}

// ── идентификация ────────────────────────────────────────────────
export type Identity = { uid: string; ip: string | null; isNew: boolean };

export function identify(req: Request): Identity {
  const cookie = req.headers.get("cookie") ?? "";
  const m = /(?:^|;\s*)antracit_uid=([A-Za-z0-9-]{16,64})/.exec(cookie);
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  if (m) return { uid: m[1], ip: fwd, isNew: false };
  return { uid: crypto.randomUUID(), ip: fwd, isNew: true };
}

export function cookieHeader(uid: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `antracit_uid=${uid}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly${secure}`;
}

const keysFor = (id: Identity) => {
  const d = today();
  return [`aq:${d}:u:${id.uid}`, ...(id.ip ? [`aq:${d}:ip:${id.ip}`] : [])];
};

// ── API ───────────────────────────────────────────────────────────
/** left = null → без ограничений. */
export async function quotaState(id: Identity): Promise<{ limit: number; left: number | null }> {
  const limit = getLimits().freePerDay;
  if (limit <= 0) return { limit: 0, left: null };
  const [u, ip] = await safe((s) => s.get(keysFor(id)));
  let left = limit - u;
  // Доп. защита от очистки cookie: потолок на IP (3× от лимита).
  if (id.ip) left = Math.min(left, limit * 3 - (ip ?? 0));
  return { limit, left: Math.max(0, left) };
}

export async function consume(id: Identity) {
  if (getLimits().freePerDay <= 0) return;
  await safe((s) => s.incr(keysFor(id), 1));
}

export async function refund(id: Identity) {
  if (getLimits().freePerDay <= 0) return;
  await safe((s) => s.incr(keysFor(id), -1));
}
