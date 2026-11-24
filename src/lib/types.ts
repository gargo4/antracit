import type { Level, Mode } from "../config/modes";

export type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Маленькие превью приложенных фото (полные картинки локально не хранятся). */
  thumbs?: string[];
  /** Старый формат (одно фото) — для чатов, сохранённых раньше. */
  thumb?: string;
  error?: boolean;
  mode?: Mode;
};

export type Chat = {
  id: string;
  title: string;
  mode: Mode;
  updatedAt: number;
  messages: Msg[];
};

export type KeyChoice = "auto" | 0 | 1 | 2;

export type Settings = {
  keySlot: KeyChoice;
  fallback: boolean; // автопереключение на следующий ключ
  pin: string;
  level: Level; // «Просто» (школа) или «Подробно» (вуз)
};

export const DEFAULT_SETTINGS: Settings = { keySlot: "auto", fallback: true, pin: "", level: "school" };

export type Status = {
  ready: boolean;
  keys: { slot: number; label: string; configured: boolean; available: boolean; cooldownSec: number }[];
  quota: { limit: number; left: number | null };
  limits: { maxTextChars: number; maxImageBytes: number };
  pinRequired: boolean;
  model: string;
};

export type PendingImage = { dataUrl: string; thumb: string; bytes: number; name: string };

/** Превью фото сообщения в любом формате (старом и новом). */
export function msgThumbs(m: Msg): string[] {
  return m.thumbs ?? (m.thumb ? [m.thumb] : []);
}
