// Единственная точка, где вызывается нейросеть. API-ключи читаются здесь, на сервере,
// и никогда не попадают в браузер.
import { getAiConfig, getLimits } from "../../../config/ai.server";
import { buildSystemPrompt } from "../../../config/prompts";
import type { Level, Mode } from "../../../config/modes";
import { getKey, isReady, markFailure, markSuccess, orderedSlots, shouldRotate } from "../../../lib/keys";
import { consume, cookieHeader, identify, quotaState, refund, type Identity } from "../../../lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type InMsg = { role: "user" | "assistant"; content: string; image?: string };
type OutPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type OutMsg = { role: "system" | "user" | "assistant"; content: string | OutPart[] };

const IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const CONNECT_TIMEOUT_MS = 25_000;

function fail(status: number, code: string, message: string, id?: Identity, extra?: Record<string, string>) {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store", ...extra });
  if (id?.isNew) headers.append("Set-Cookie", cookieHeader(id.uid));
  return new Response(JSON.stringify({ error: code, code, message }), { status, headers });
}

function readPin(req: Request): string {
  const raw = req.headers.get("x-admin-pin") ?? "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function POST(req: Request) {
  const id = identify(req);
  const limits = getLimits();
  const ai = getAiConfig();

  // ── 1. Разбор и валидация запроса ───────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_json", "Некорректный запрос.", id);
  }
  const b = (body ?? {}) as { mode?: string; level?: string; messages?: unknown };
  const mode: Mode = b.mode === "compress" || b.mode === "vision" ? b.mode : "chat";
  const level: Level = b.level === "student" ? "student" : "school";

  const raw = Array.isArray(b.messages) ? b.messages : [];
  const msgs: InMsg[] = [];
  for (const m of raw.slice(-limits.maxHistory)) {
    const r = m as Partial<InMsg>;
    if ((r?.role !== "user" && r?.role !== "assistant") || typeof r.content !== "string") continue;
    msgs.push({ role: r.role, content: r.content, image: typeof r.image === "string" ? r.image : undefined });
  }
  const last = msgs[msgs.length - 1];
  if (!last || last.role !== "user" || !last.content.trim()) {
    return fail(400, "empty", "Пустое сообщение.", id);
  }
  if (last.content.length > limits.maxTextChars) {
    return fail(413, "text_too_long", `Слишком длинный текст: максимум ${limits.maxTextChars} символов.`, id);
  }
  if (last.image) {
    if (!IMAGE_RE.test(last.image)) {
      return fail(400, "bad_image", "Неподдерживаемый формат изображения (нужен PNG, JPEG, WebP или GIF).", id);
    }
    if (last.image.length > limits.maxImageBytes * 1.37) {
      // base64 ≈ 4/3 от размера файла
      return fail(413, "image_too_large", "Изображение слишком большое даже после сжатия.", id);
    }
  }
  const hasImage = Boolean(last.image);

  // ── 2. Ключи ────────────────────────────────────────────────────
  const pinSet = process.env.ADMIN_PIN?.trim();
  const canChoose = !pinSet || readPin(req) === pinSet;
  const prefRaw = req.headers.get("x-key-slot");
  const preferred: number | "auto" = canChoose && prefRaw && /^[0-2]$/.test(prefRaw) ? Number(prefRaw) : "auto";
  const fallback = !canChoose || req.headers.get("x-key-fallback") !== "0";
  const order = orderedSlots(preferred, fallback);
  if (order.length === 0) {
    return fail(503, "no_keys", "Сервис ещё не настроен: на сервере не задан ни один API-ключ.", id);
  }

  // ── 3. Бесплатный лимит ─────────────────────────────────────────
  const q = await quotaState(id);
  if (q.left !== null && q.left <= 0) {
    return fail(429, "quota", "Бесплатные запросы на сегодня закончились. Открой «Безлимит» или возвращайся завтра.", id, {
      "x-quota-left": "0",
    });
  }
  await consume(id);

  // ── 4. Сообщения для нейросети ──────────────────────────────────
  const upstream: OutMsg[] = [{ role: "system", content: buildSystemPrompt(mode, level) }];
  msgs.forEach((m, i) => {
    const isLast = i === msgs.length - 1;
    const text = isLast ? m.content : m.content.slice(0, limits.maxHistoryItemChars);
    if (isLast && m.image) {
      upstream.push({
        role: "user",
        content: [
          { type: "text", text },
          { type: "image_url", image_url: { url: m.image } },
        ],
      });
    } else {
      upstream.push({ role: m.role, content: text });
    }
  });

  const body_ = (model: string) =>
    JSON.stringify({
      model,
      messages: upstream,
      stream: true,
      max_tokens: ai.maxOutputTokens,
      temperature: ai.temperature,
    });

  // ── 5. Вызов провайдера: ротация ключей И моделей ───────────────
  // Перебор: лучшая модель × все ключи → следующая модель × все ключи …
  // Пары, которые недавно падали (403/404/лимит), уходят в конец очереди.
  const models = hasImage ? ai.visionModels : ai.models;
  const all = models.flatMap((model) => order.map((slot) => ({ model, slot })));
  const attempts = [...all.filter((a) => isReady(a.slot, a.model)), ...all.filter((a) => !isReady(a.slot, a.model))];
  const deadSlots = new Set<number>(); // ключ невалиден/пуст в рамках этого запроса
  const skipModels = new Set<string>(); // модель отвергла сам запрос (400) — другие ключи не помогут

  let lastStatus = 0;
  let lastDetail = "";
  for (const { model, slot } of attempts) {
    if (skipModels.has(model) || deadSlots.has(slot)) continue;
    const key = getKey(slot);
    if (!key) continue;

    const ctrl = new AbortController();
    const onClientAbort = () => ctrl.abort();
    req.signal.addEventListener("abort", onClientAbort);
    const timer = setTimeout(() => ctrl.abort(), CONNECT_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${ai.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          // Google принимает ключ и так (нужно для ключей вида AQ.…)
          ...(ai.baseUrl.includes("googleapis.com") ? { "x-goog-api-key": key } : {}),
          ...ai.extraHeaders,
        },
        body: body_(model),
        signal: ctrl.signal,
      });
    } catch {
      clearTimeout(timer);
      req.signal.removeEventListener("abort", onClientAbort);
      if (req.signal.aborted) {
        await refund(id);
        return new Response(null, { status: 499 });
      }
      markFailure(slot, model, 503, "");
      lastStatus = 0;
      lastDetail = "нет соединения с провайдером";
      continue;
    }
    clearTimeout(timer);

    if (res.ok && res.body) {
      markSuccess(slot, model);
      const headers = new Headers({
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
        "x-key-used": String(slot),
        "x-model-used": model,
        "x-quota-left": String((await quotaState(id)).left ?? -1),
      });
      if (id.isNew) headers.append("Set-Cookie", cookieHeader(id.uid));
      const stream = toTextStream(res.body, () => req.signal.removeEventListener("abort", onClientAbort));
      return new Response(stream, { headers });
    }

    req.signal.removeEventListener("abort", onClientAbort);
    const text = await res.text().catch(() => "");
    lastStatus = res.status;
    lastDetail = extractError(text);

    if (shouldRotate(res.status)) {
      const ra = Number(res.headers.get("retry-after"));
      markFailure(slot, model, res.status, text, Number.isFinite(ra) && ra > 0 ? ra : undefined);
      if (res.status === 401 || res.status === 402) deadSlots.add(slot);
    } else {
      skipModels.add(model); // 400/422…: пробуем следующую модель, но не другие ключи этой же
    }
  }

  // Все комбинации ключ×модель отказали. Технические коды пользователю не показываем.
  await refund(id);
  console.error("[antracit] all attempts failed; last:", lastStatus, lastDetail);
  const hint = lastStatus === 400 || lastStatus === 422 ? friendlyUpstream(lastStatus, lastDetail, hasImage) : "";
  return fail(
    503,
    "all_keys_failed",
    hint || "Сервис временно перегружен — все модели и ключи заняты. Попробуй ещё раз через минуту.",
    id,
  );
}

function extractError(text: string): string {
  try {
    const j = JSON.parse(text);
    const msg = j?.error?.message ?? j?.message ?? j?.error;
    if (typeof msg === "string") return msg.slice(0, 200);
  } catch {
    /* не JSON */
  }
  return text.replace(/\s+/g, " ").slice(0, 200);
}

function friendlyUpstream(status: number, _detail: string, hasImage: boolean): string {
  if (hasImage && (status === 400 || status === 422)) {
    return "Модель не приняла это изображение. Попробуй другое фото или скриншот поменьше.";
  }
  return "Модель не смогла обработать этот запрос. Попробуй переформулировать или сократить текст.";
}

/** SSE провайдера (`data: {...}`) → простой поток текста для клиента. */
function toTextStream(upstream: ReadableStream<Uint8Array>, onDone: () => void): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buf = "";

  const parseLine = (rawLine: string): string => {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) return "";
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return "";
    try {
      const j = JSON.parse(data);
      const t = j?.choices?.[0]?.delta?.content;
      if (typeof t === "string") return t;
      if (j?.error) return `\n\n⚠️ ${j.error.message ?? "Ошибка провайдера"}`;
    } catch {
      /* неполный/служебный кусок */
    }
    return "";
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            const tail = parseLine(buf);
            if (tail) controller.enqueue(enc.encode(tail));
            onDone();
            controller.close();
            return;
          }
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          let out = "";
          for (const l of lines) out += parseLine(l);
          if (out) {
            controller.enqueue(enc.encode(out));
            return;
          }
        }
      } catch (e) {
        onDone();
        controller.error(e);
      }
    },
    cancel() {
      onDone();
      return reader.cancel().catch(() => undefined);
    },
  });
}
