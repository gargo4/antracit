"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MODES, type Category, type Mode } from "../config/modes";
import { compressImage } from "../lib/image";
import { loadChats, loadSettings, saveChats, saveSettings, uid } from "../lib/storage";
import { DEFAULT_SETTINGS, type Chat, type Msg, type PendingImage, type Settings, type Status } from "../lib/types";
import { Composer } from "./Composer";
import { Icon, Logo } from "./Icons";
import { MessageView } from "./MessageView";
import { SettingsModal, UnlimitedModal } from "./Modals";
import { Sidebar } from "./Sidebar";

const SUGGESTIONS: Record<Mode, string[]> = {
  chat: ["Реши уравнение 2x² − 5x + 2 = 0 по шагам", "Объясни, как работает рекурсия, на примере на Python", "Составь план подготовки к экзамену на 7 дней"],
  compress: ["Сделай выжимку из длинной переписки или статьи", "Расшифруй мои заметки и выдели задачи", "Преврати конспект лекции в структуру"],
  vision: ["Выпиши текст со скриншота", "Реши задачу с фотографии из учебника", "Объясни, что изображено на схеме"],
};

class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

function makeTitle(text: string, hasImage: boolean): string {
  const t = text.replace(/\s+/g, " ").trim();
  const base = t.length > 42 ? t.slice(0, 42).trimEnd() + "…" : t;
  return base || (hasImage ? "Анализ фото" : "Новый чат");
}

export default function ChatApp() {
  const [ready, setReady] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("all");
  const [mode, setMode] = useState<Mode>("chat");
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<PendingImage | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [unlimitedOpen, setUnlimitedOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<Status | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const active = chats.find((c) => c.id === activeId) ?? null;

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/status", { cache: "no-store" });
      if (r.ok) setStatus((await r.json()) as Status);
    } catch {
      /* офлайн — оставляем прежний статус */
    }
  }, []);

  // ── загрузка с устройства ────────────────────────────────────
  useEffect(() => {
    const stored = loadChats();
    setChats(stored);
    setSettings(loadSettings());
    setReady(true);
    refreshStatus();
  }, [refreshStatus]);

  // ── сохранение истории (не во время стрима, чтобы не писать на каждый токен)
  useEffect(() => {
    if (ready && !streaming) saveChats(chats);
  }, [chats, ready, streaming]);

  useEffect(() => {
    if (ready) saveSettings(settings);
  }, [settings, ready]);

  // ── автопрокрутка вниз, если пользователь не листал вверх ─────
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chats, activeId]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // ── действия ──────────────────────────────────────────────────
  const newChat = () => {
    if (streaming) return;
    setActiveId(null);
    setInput("");
    setPending(null);
    setSidebar(false);
  };

  const selectChat = (id: string) => {
    if (streaming) return;
    const c = chats.find((x) => x.id === id);
    if (!c) return;
    setActiveId(id);
    setMode(c.mode);
    setSidebar(false);
    stick.current = true;
  };

  const deleteChat = (id: string) => {
    if (streaming && id === activeId) return;
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (id === activeId) setActiveId(null);
  };

  const clearHistory = () => {
    if (streaming) return;
    if (!window.confirm("Удалить всю историю чатов на этом устройстве?")) return;
    setChats([]);
    setActiveId(null);
    setSettingsOpen(false);
  };

  const onFile = async (file: File) => {
    try {
      const maxBytes = status?.limits.maxImageBytes ?? 1_500_000;
      const img = await compressImage(file, maxBytes);
      setPending(img);
      setMode("vision");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Не удалось обработать фото");
    }
  };

  const changeMode = (m: Mode) => {
    setMode(m);
    if (m !== "vision" && pending) setPending(null); // фото относится только к режиму анализа
  };

  const run = async (rawText: string, image: PendingImage | null, modeOverride?: Mode) => {
    if (streaming) return;
    const useMode: Mode = image ? "vision" : (modeOverride ?? mode);
    const text = rawText.trim() || (image ? MODES.vision.defaultImagePrompt ?? "" : "");
    if (!text) return;

    const maxChars = status?.limits.maxTextChars ?? 8000;
    if (text.length > maxChars) {
      flash(`Слишком длинный текст: максимум ${maxChars} символов`);
      return;
    }
    if (useMode === "vision" && !image && !active?.messages.some((m) => m.thumb)) {
      flash("Прикрепите фото (кнопка слева, галерея/камера или Ctrl+V)");
      return;
    }

    const chatId = active?.id ?? uid();
    const userMsg: Msg = { id: uid(), role: "user", content: text, thumb: image?.thumb, mode: useMode };
    const botMsg: Msg = { id: uid(), role: "assistant", content: "", mode: useMode };

    // история для модели: без ошибок и пустых; о приложенных ранее фото — пометка
    const history = (active?.messages ?? [])
      .filter((m) => !m.error && m.content.trim())
      .map((m) => ({ role: m.role, content: m.thumb ? `${m.content}\n[к сообщению было приложено изображение]` : m.content }));

    setChats((prev) => {
      const exists = prev.some((c) => c.id === chatId);
      const base: Chat[] = exists ? prev : [{ id: chatId, title: makeTitle(rawText.trim() || text, Boolean(image)), mode: useMode, updatedAt: Date.now(), messages: [] }, ...prev];
      return base.map((c) => (c.id === chatId ? { ...c, mode: useMode, updatedAt: Date.now(), messages: [...c.messages, userMsg, botMsg] } : c));
    });
    setActiveId(chatId);
    setMode(useMode);
    setInput("");
    setPending(null);
    setStreaming(true);
    stick.current = true;

    const ac = new AbortController();
    abortRef.current = ac;
    const patch = (content: string, extra?: Partial<Msg>) =>
      setChats((prev) => prev.map((c) => (c.id !== chatId ? c : { ...c, messages: c.messages.map((m) => (m.id === botMsg.id ? { ...m, content, ...extra } : m)) })));

    let acc = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        signal: ac.signal,
        headers: {
          "Content-Type": "application/json",
          "x-key-slot": String(settings.keySlot),
          "x-key-fallback": settings.fallback ? "1" : "0",
          ...(settings.pin ? { "x-admin-pin": encodeURIComponent(settings.pin) } : {}),
        },
        body: JSON.stringify({
          mode: useMode,
          messages: [...history, { role: "user", content: text, ...(image ? { image: image.dataUrl } : {}) }],
        }),
      });

      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { message?: string; code?: string } | null;
        throw new ApiError(j?.message ?? `Ошибка сервера (${res.status})`, j?.code);
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        patch(acc);
      }
      acc += dec.decode();
      if (!acc.trim()) patch("Модель вернула пустой ответ. Попробуй переформулировать запрос.", { error: true });
      else patch(acc);
    } catch (e) {
      if (ac.signal.aborted) {
        if (!acc) patch("Остановлено.", { error: true });
      } else {
        const err = e instanceof ApiError ? e : null;
        patch(err ? err.message : "Не удалось связаться с сервером. Проверь интернет и попробуй ещё раз.", { error: true });
        if (err?.code === "quota") setUnlimitedOpen(true);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      refreshStatus();
    }
  };

  const send = () => run(input, pending);
  const stop = () => abortRef.current?.abort();

  const lastBotId = active ? [...active.messages].reverse().find((m) => m.role === "assistant")?.id : undefined;
  const maxChars = status?.limits.maxTextChars ?? 8000;

  return (
    <div className="app">
      <Sidebar
        open={sidebar}
        chats={chats}
        activeId={activeId}
        category={category}
        status={status}
        onClose={() => setSidebar(false)}
        onNew={newChat}
        onSelect={selectChat}
        onDelete={deleteChat}
        onCategory={setCategory}
        onUnlimited={() => { setUnlimitedOpen(true); setSidebar(false); }}
        onSettings={() => { refreshStatus(); setSettingsOpen(true); setSidebar(false); }}
      />

      <main className="main">
        <header className="topbar glass">
          <button type="button" className="icon-btn menu-btn" onClick={() => setSidebar(true)} aria-label="Открыть меню">
            <Icon name="menu" size={20} />
          </button>
          <div className="top-title">
            <b>{active?.title ?? "Новый чат"}</b>
            <small>{MODES[mode].label}</small>
          </div>
          <button type="button" className="icon-btn" onClick={newChat} aria-label="Новый чат" disabled={streaming}>
            <Icon name="plus" size={20} />
          </button>
        </header>

        <div className="scroll" ref={scroller} onScroll={onScroll}>
          {!active || active.messages.length === 0 ? (
            <div className="hero">
              <div className="hero-logo"><Logo size={64} /></div>
              <h1>ANTRACIT</h1>
              <p>{MODES[mode].hint}. Выбери режим ниже и пиши — всё уже настроено.</p>
              {status && !status.ready && (
                <div className="notice">Сервер ещё не настроен: не задан ни один API-ключ (см. <code>.env.example</code>).</div>
              )}
              <div className="suggest">
                {SUGGESTIONS[mode].map((s) => (
                  <button key={s} type="button" className="glass suggest-card" onClick={() => setInput(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="feed">
              {active.messages.map((m) => (
                <MessageView
                  key={m.id}
                  msg={m}
                  streaming={streaming && m.id === active.messages[active.messages.length - 1].id}
                  showQuick={!streaming && m.id === lastBotId}
                  onQuick={(prompt) => run(prompt, null, active.mode)}
                />
              ))}
            </div>
          )}
        </div>

        <Composer
          mode={mode}
          onMode={changeMode}
          value={input}
          onChange={setInput}
          pending={pending}
          onFile={onFile}
          onRemoveImage={() => setPending(null)}
          onSend={send}
          onStop={stop}
          streaming={streaming}
          maxChars={maxChars}
        />
      </main>

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          status={status}
          onChange={setSettings}
          onRefresh={refreshStatus}
          onClearHistory={clearHistory}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {unlimitedOpen && <UnlimitedModal status={status} onClose={() => setUnlimitedOpen(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
