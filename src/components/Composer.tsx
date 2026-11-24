"use client";
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { MAX_IMAGES, MODE_ORDER, MODES, type Mode } from "../config/modes";
import type { PendingImage } from "../lib/types";
import { Icon, type IconName } from "./Icons";

const MODE_ICON: Record<Mode, IconName> = { chat: "chat", learn: "book", compress: "compress", vision: "image" };

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
  pending: PendingImage[];
  onFiles: (files: File[]) => void;
  onRemoveImage: (index: number) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  maxChars: number;
  focusTick: number;
  pickTick: number;
  sos: boolean;
  onCancelSos: () => void;
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
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (files.length) {
      e.preventDefault(); // Ctrl+V со скриншотом
      p.onFiles(files);
    }
  };

  const onDrop = (e: DragEvent) => {
    setDrag(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length) {
      e.preventDefault();
      p.onFiles(files);
    }
  };

  const send = () => {
    if (listening) recRef.current?.stop();
    p.onSend();
  };

  const canSend = !p.streaming && (p.value.trim().length > 0 || p.pending.length > 0);
  const full = p.pending.length >= MAX_IMAGES;
  const over = p.value.length > p.maxChars;
  const activeIdx = MODE_ORDER.indexOf(p.mode);

  return (
    <div className="composer-wrap">
      <div className="modes" role="tablist" aria-label="Режим работы" style={{ ["--i" as string]: activeIdx, ["--n" as string]: MODE_ORDER.length }}>
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
        className={`composer glass${drag ? " is-drag" : ""}${listening ? " is-listening" : ""}${p.sos ? " is-sos" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        {p.sos && (
          <div className="sos-banner">
            <b>🆘 SOS</b>
            <span>Напиши тему или кинь фото — дам шпаргалку в 3 строки</span>
            <button type="button" onClick={p.onCancelSos} aria-label="Выключить SOS">
              <Icon name="close" size={14} />
            </button>
          </div>
        )}

        {p.pending.length > 0 && (
          <div className="attach-strip">
            {p.pending.map((img, i) => (
              <div key={i} className="attach-tile">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.thumb} alt={`Фото ${i + 1}`} />
                {p.pending.length > 1 && <span className="attach-num">{i + 1}</span>}
                <button type="button" className="attach-x" onClick={() => p.onRemoveImage(i)} aria-label={`Убрать фото ${i + 1}`}>
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
            {!full && (
              <button type="button" className="attach-add" onClick={() => fileRef.current?.click()} aria-label="Добавить ещё фото">
                <Icon name="plus" size={18} />
                <small>страница</small>
              </button>
            )}
            <div className="attach-meta">
              {p.pending.length} / {MAX_IMAGES} фото
              <small>{p.mode === "compress" ? "перескажу коротко" : p.mode === "learn" ? "научу по этой теме" : "разберу, что на фото"}</small>
            </div>
          </div>
        )}

        <div className="composer-row">
          <button
            type="button"
            className="icon-btn attach-btn"
            onClick={() => (full ? p.onToast(`Максимум ${MAX_IMAGES} фото за раз`) : fileRef.current?.click())}
            aria-label="Прикрепить фото"
            title="Фото: галерея, камера или Ctrl+V (до 4 страниц)"
          >
            <Icon name="image" size={20} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) p.onFiles(files);
              e.target.value = ""; // чтобы можно было выбрать тот же файл повторно
            }}
          />
          <textarea
            ref={ta}
            rows={1}
            value={p.value}
            placeholder={listening ? "Говори — я записываю…" : p.sos ? "Тема, вопрос или задача…" : MODES[p.mode].placeholder}
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
        {drag && <div className="drop-hint">Отпусти, чтобы прикрепить фото (до {MAX_IMAGES})</div>}
      </div>
    </div>
  );
}
