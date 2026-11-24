"use client";
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { MODE_ORDER, MODES, type Mode } from "../config/modes";
import type { PendingImage } from "../lib/types";
import { Icon, type IconName } from "./Icons";

const MODE_ICON: Record<Mode, IconName> = { chat: "chat", compress: "compress", vision: "image" };

// Web Speech API (Chrome, Edge, Safari). Где её нет — кнопка микрофона скрыта.
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};
function getRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

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
  focusTick: number;
  pickTick: number;
  onToast: (msg: string) => void;
};

export function Composer(p: Props) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<Recognition | null>(null);
  const baseText = useRef("");
  const [canVoice, setCanVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const [drag, setDrag] = useState(false);

  useEffect(() => setCanVoice(getRecognition() !== null), []);

  // авто-высота поля
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [p.value]);

  // фокус после «Новый чат» / «Изменить» (на ПК; на телефоне не дёргаем клавиатуру без нужды)
  useEffect(() => {
    if (p.focusTick === 0) return;
    const el = ta.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [p.focusTick]);

  // кнопка «📷 …» от ИИ открывает выбор фото
  useEffect(() => {
    if (p.pickTick > 0) fileRef.current?.click();
  }, [p.pickTick]);

  useEffect(() => () => recRef.current?.stop(), []);

  const toggleVoice = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const R = getRecognition();
    if (!R) return;
    const rec = new R();
    rec.lang = "ru-RU";
    rec.interimResults = true;
    rec.continuous = true;
    baseText.current = p.value ? p.value.replace(/\s*$/, " ") : "";
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      p.onChange((baseText.current + finalText + interim).replace(/\s+/g, " ").trimStart());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") p.onToast("Нет доступа к микрофону — разреши его в браузере");
      else if (e.error !== "aborted" && e.error !== "no-speech") p.onToast("Голосовой ввод сейчас недоступен");
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };
    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      p.onToast("Голосовой ввод сейчас недоступен");
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault(); // Ctrl+V со скриншотом
      p.onFile(file);
    }
  };

  const onDrop = (e: DragEvent) => {
    setDrag(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      p.onFile(file);
    }
  };

  const send = () => {
    if (listening) recRef.current?.stop();
    p.onSend();
  };

  const canSend = !p.streaming && (p.value.trim().length > 0 || p.pending !== null);
  const over = p.value.length > p.maxChars;
  const activeIdx = MODE_ORDER.indexOf(p.mode);

  return (
    <div className="composer-wrap">
      <div className="modes" role="tablist" aria-label="Режим работы" style={{ ["--i" as string]: activeIdx }}>
        <span className="mode-glider" aria-hidden="true" />
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
            <span className="mode-long">{MODES[m].label}</span>
            <span className="mode-short">{MODES[m].short}</span>
          </button>
        ))}
      </div>

      <div
        className={`composer glass${drag ? " is-drag" : ""}${listening ? " is-listening" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        {p.pending && (
          <div className="attach">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.pending.thumb} alt="Превью фото" />
            <div className="attach-info">
              <b>{p.pending.name}</b>
              <small>{p.pending.bytes ? `сжато до ${(p.pending.bytes / 1024).toFixed(0)} КБ` : "готово к отправке"}</small>
            </div>
            <button type="button" className="icon-btn" onClick={p.onRemoveImage} aria-label="Убрать фото">
              <Icon name="close" size={16} />
            </button>
          </div>
        )}

        <div className="composer-row">
          <button type="button" className="icon-btn attach-btn" onClick={() => fileRef.current?.click()} aria-label="Прикрепить фото" title="Фото: галерея, камера или Ctrl+V">
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
            placeholder={listening ? "Говори — я записываю…" : MODES[p.mode].placeholder}
            onChange={(e) => p.onChange(e.target.value)}
            onPaste={onPaste}
            enterKeyHint="send"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(hover: hover)").matches) {
                e.preventDefault();
                if (canSend && !over) send();
              }
            }}
          />
          {canVoice && !p.streaming && (
            <button
              type="button"
              className={`icon-btn mic-btn${listening ? " is-on" : ""}`}
              onClick={toggleVoice}
              aria-label={listening ? "Остановить запись" : "Голосовой ввод"}
              aria-pressed={listening}
            >
              <Icon name="mic" size={19} />
            </button>
          )}
          {p.streaming ? (
            <button type="button" className="send is-stop" onClick={p.onStop} aria-label="Остановить (Esc)">
              <Icon name="stop" size={18} />
            </button>
          ) : (
            <button type="button" className="send sheen" onClick={send} disabled={!canSend || over} aria-label="Отправить">
              <Icon name="send" size={20} />
            </button>
          )}
        </div>
        {p.value.length > p.maxChars * 0.8 && (
          <div className={`counter${over ? " is-over" : ""}`}>
            {p.value.length} / {p.maxChars}
          </div>
        )}
        {drag && <div className="drop-hint">Отпусти, чтобы прикрепить фото</div>}
      </div>
    </div>
  );
}
