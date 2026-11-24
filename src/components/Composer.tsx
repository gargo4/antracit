"use client";
import { useEffect, useRef, type ClipboardEvent, type DragEvent } from "react";
import { MODE_ORDER, MODES, type Mode } from "../config/modes";
import type { PendingImage } from "../lib/types";
import { Icon, type IconName } from "./Icons";

const MODE_ICON: Record<Mode, IconName> = { chat: "chat", compress: "compress", vision: "image" };

type Props = {
  mode: Mode;
  onMode: (m: Mode) => void;
  value: string;
  onChange: (v: string) => void;
  pending: PendingImage | null;
  onFile: (f: File) => void;
  onRemoveImage: () => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  maxChars: number;
};

export function Composer(p: Props) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // авто-высота поля ввода
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [p.value]);

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault(); // Ctrl+V со скриншотом
      p.onFile(file);
    }
  };

  const onDrop = (e: DragEvent) => {
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      p.onFile(file);
    }
  };

  const canSend = !p.streaming && (p.value.trim().length > 0 || p.pending !== null);
  const over = p.value.length > p.maxChars;

  return (
    <div className="composer-wrap">
      <div className="modes" role="tablist" aria-label="Режим работы">
        {MODE_ORDER.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={p.mode === m}
            className={`mode${p.mode === m ? " is-active" : ""}`}
            onClick={() => p.onMode(m)}
            title={MODES[m].hint}
          >
            <Icon name={MODE_ICON[m]} size={16} />
            <span>{MODES[m].label}</span>
          </button>
        ))}
      </div>

      <div className="composer glass" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        {p.pending && (
          <div className="attach">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.pending.thumb} alt="Превью фото" />
            <div className="attach-info">
              <b>{p.pending.name}</b>
              <small>сжато до {(p.pending.bytes / 1024).toFixed(0)} КБ</small>
            </div>
            <button type="button" className="icon-btn" onClick={p.onRemoveImage} aria-label="Убрать фото">
              <Icon name="close" size={16} />
            </button>
          </div>
        )}

        <div className="composer-row">
          <button type="button" className="icon-btn attach-btn" onClick={() => fileRef.current?.click()} aria-label="Прикрепить фото">
            <Icon name="image" size={20} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) p.onFile(f);
              e.target.value = ""; // чтобы можно было выбрать тот же файл повторно
            }}
          />
          <textarea
            ref={ta}
            rows={1}
            value={p.value}
            placeholder={MODES[p.mode].placeholder}
            onChange={(e) => p.onChange(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(hover: hover)").matches) {
                e.preventDefault();
                if (canSend && !over) p.onSend();
              }
            }}
          />
          {p.streaming ? (
            <button type="button" className="send is-stop" onClick={p.onStop} aria-label="Остановить">
              <Icon name="stop" size={18} />
            </button>
          ) : (
            <button type="button" className="send" onClick={p.onSend} disabled={!canSend || over} aria-label="Отправить">
              <Icon name="send" size={20} />
            </button>
          )}
        </div>
        {p.value.length > p.maxChars * 0.8 && (
          <div className={`counter${over ? " is-over" : ""}`}>
            {p.value.length} / {p.maxChars}
          </div>
        )}
      </div>
    </div>
  );
}
