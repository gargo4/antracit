// ТОЛЬКО сервер. Счётчик бесплатных запросов (в сутки) на пользователя.
//
// Хранится в памяти процесса: для одного сервера / `next start` этого достаточно.
// На serverless (Vercel) память сбрасывается между холодными стартами — для строгого
// учёта замени Map на Redis/Upstash/БД (интерфейс identify/quotaState/consume/refund
// трогать не нужно, меняется только хранилище ниже).
import { getLimits } from "../config/ai.server";

type Entry = { day: string; count: number };
const g = globalThis as unknown as { __antracitQuota?: Map<string, Entry> };
const store: Map<string, Entry> = (g.__antracitQuota ??= new Map());

const today = () => new Date().toISOString().slice(0, 10);

function entry(key: string): Entry {
  const day = today();
  let e = store.get(key);
  if (!e || e.day !== day) {
    e = { day, count: 0 };
    store.set(key, e);
  }
  return e;
}

function prune() {
  if (store.size < 5000) return;
  const day = today();
  for (const [k, v] of store) if (v.day !== day) store.delete(k);
}

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

/** left = null → без ограничений. */
export function quotaState(id: Identity): { limit: number; left: number | null } {
  const limit = getLimits().freePerDay;
  if (limit <= 0) return { limit: 0, left: null };
  let left = limit - entry("u:" + id.uid).count;
  // Доп. защита от очистки cookie: потолок на IP (3× от лимита).
  if (id.ip) left = Math.min(left, limit * 3 - entry("ip:" + id.ip).count);
  return { limit, left: Math.max(0, left) };
}

export function consume(id: Identity) {
  prune();
  entry("u:" + id.uid).count++;
  if (id.ip) entry("ip:" + id.ip).count++;
}

export function refund(id: Identity) {
  const u = entry("u:" + id.uid);
  u.count = Math.max(0, u.count - 1);
  if (id.ip) {
    const p = entry("ip:" + id.ip);
    p.count = Math.max(0, p.count - 1);
  }
}
