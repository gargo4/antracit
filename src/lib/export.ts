import { MODES } from "../config/modes";
import type { Chat } from "./types";

export function chatToMarkdown(chat: Chat): string {
  const date = new Date(chat.updatedAt).toLocaleString("ru-RU");
  const head = `# ${chat.title}\n\n_${MODES[chat.mode].label} · ${date} · ANTRACIT_\n`;
  const body = chat.messages
    .filter((m) => m.content.trim())
    .map((m) => (m.role === "user" ? `## 🧑 Вы${m.thumb ? " (с фото)" : ""}\n\n${m.content}` : `## ⬡ ANTRACIT\n\n${m.content}`))
    .join("\n\n---\n\n");
  return `${head}\n${body}\n`;
}

/** Скачивает чат как .md; если скачивание недоступно — копирует в буфер. */
export async function exportChat(chat: Chat): Promise<"download" | "copy"> {
  const md = chatToMarkdown(chat);
  const noDownload = (window as unknown as { __ANTRACIT_NO_DOWNLOAD?: boolean }).__ANTRACIT_NO_DOWNLOAD;
  if (!noDownload) {
    try {
      const url = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${chat.title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60) || "chat"}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return "download";
    } catch {
      /* упадём на копирование */
    }
  }
  try {
    await navigator.clipboard.writeText(md);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = md;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  return "copy";
}
