// Серия дней 🔥 и счётчик ответов — хранятся на устройстве, без сервера.

const KEY = "antracit.streak.v1";

export type Streak = { days: number; total: number; today: boolean };
type Stored = { last: string; days: number; total: number };

const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => dayStr(new Date());
const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayStr(d);
};

function read(): Stored | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null") as Stored | null;
    return s && typeof s.days === "number" ? s : null;
  } catch {
    return null;
  }
}

export function loadStreak(): Streak {
  const s = read();
  if (!s) return { days: 0, total: 0, today: false };
  const alive = s.last === today() || s.last === yesterday();
  return { days: alive ? s.days : 0, total: s.total, today: s.last === today() };
}

/** Засчитать полученный ответ. Возвращает новую серию и флаг «сегодня первый раз» (для поздравления). */
export function bumpStreak(): Streak & { firstToday: boolean } {
  const s = read();
  const t = today();
  let days = 1;
  if (s?.last === t) days = s.days;
  else if (s?.last === yesterday()) days = s.days + 1;
  const next: Stored = { last: t, days, total: (s?.total ?? 0) + 1 };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* хранилище недоступно */
  }
  return { days, total: next.total, today: true, firstToday: s?.last !== t };
}

/** «1 день», «2 дня», «5 дней». */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
