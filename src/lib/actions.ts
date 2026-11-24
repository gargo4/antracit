// Разбор строки кнопок, которую ИИ ставит в конце ответа:  <<кнопки: А | Б | В>>
const FULL = /\n?[ \t]*<<\s*кнопки\s*:([^>\n]*)>>\s*$/i;
const KEYWORD = "кнопки:";

/** Последняя строка — недописанное начало «<<кнопки: …» (пока ответ печатается). */
function partialStart(content: string): number {
  const nl = content.lastIndexOf("\n");
  const line = content.slice(nl + 1).trimStart().toLowerCase();
  if (line === "<") return nl + 1;
  if (!line.startsWith("<<")) return -1;
  const rest = line.slice(2).trimStart();
  return KEYWORD.startsWith(rest) || rest.startsWith(KEYWORD) ? nl + 1 : -1;
}

const STEP = /^\s*<<\s*шаг\s*:\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*>>[ \t]*\n?/i;

/** Прогресс урока в начале ответа: <<шаг: 2/5>>. Пока печатается — прячем недописанную метку. */
export function splitStep(content: string, streaming: boolean): { text: string; step: { n: number; total: number } | null } {
  const m = STEP.exec(content);
  if (m) {
    const total = Math.max(1, Number(m[2]));
    return { text: content.slice(m[0].length), step: { n: Math.min(Math.max(1, Number(m[1])), total), total } };
  }
  if (streaming) {
    const head = content.trimStart();
    if (head.startsWith("<") && !head.includes(">>") && !head.includes("\n") && head.length < 20) return { text: "", step: null };
  }
  return { text: content, step: null };
}

export function splitActions(content: string, streaming: boolean): { text: string; actions: string[] } {
  const m = FULL.exec(content);
  if (m) {
    const actions = m[1]
      .split("|")
      .map((s) => s.trim().replace(/^["«]|["»]$/g, ""))
      .filter((s) => s.length > 0 && s.length <= 40)
      .slice(0, 4);
    return { text: content.slice(0, m.index).trimEnd(), actions };
  }
  if (streaming) {
    const at = partialStart(content);
    if (at >= 0) return { text: content.slice(0, at).trimEnd(), actions: [] };
  }
  return { text: content, actions: [] };
}

/** Текст для истории и экспорта — без служебной строки кнопок. */
export function stripActions(content: string): string {
  return splitStep(splitActions(content, false).text, false).text;
}
