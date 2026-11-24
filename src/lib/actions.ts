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
  return splitActions(content, false).text;
}
