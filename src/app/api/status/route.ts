import { getAiConfig, getLimits } from "../../../config/ai.server";
import { slotStatuses } from "../../../lib/keys";
import { cookieHeader, identify, quotaState } from "../../../lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Публичный статус: какие слоты ключей настроены, остаток запросов, лимиты. Самих ключей здесь нет. */
export async function GET(req: Request) {
  const id = identify(req);
  const limits = getLimits();
  const keys = slotStatuses();
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  if (id.isNew) headers.append("Set-Cookie", cookieHeader(id.uid));

  return new Response(
    JSON.stringify({
      ready: keys.some((k) => k.configured),
      keys,
      quota: await quotaState(id),
      limits: { maxTextChars: limits.maxTextChars, maxImageBytes: limits.maxImageBytes },
      pinRequired: Boolean(process.env.ADMIN_PIN?.trim()),
      model: getAiConfig().model,
    }),
    { headers },
  );
}
