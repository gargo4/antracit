"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LEVELS, MODES, PHOTO_ACTION_PREFIX, type Category, type Mode } from "../config/modes";
import { stripActions } from "../lib/actions";
import { exportChat } from "../lib/export";
import { compressImage } from "../lib/image";
import { loadChats, loadSettings, saveChats, saveSettings, uid } from "../lib/storage";
import { DEFAULT_SETTINGS, type Chat, type Msg, type PendingImage, type Settings, type Status } from "../lib/types";
import { Composer } from "./Composer";
import { Icon, Logo } from "./Icons";
import { MessageView } from "./MessageView";
import { SettingsModal, UnlimitedModal } from "./Modals";
import { Sidebar } from "./Sidebar";

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

type RunOpts = { mode?: Mode; base?: Msg[] };

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
  const [atBottom, setAtBottom] = useState(true);
  const [focusTick, setFocusTick] = useState(0);
  const [pickTick, setPickTick] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  /** Полные (сжатые) фото последних сообщений — для «Перегенерировать» без потери качества. */
  const images = useRef(new Map<string, string>());

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
    setChats(loadChats());
    setSettings(loadSettings());
    setReady(true);
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (ready && !streaming) saveChats(chats);
  }, [chats, ready, streaming]);

  useEffect(() => {
    if (ready) saveSettings(settings);
  }, [settings, ready]);

  // ── прокрутка ────────────────────────────────────────────────
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chats, activeId]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stick.current = bottom;
    setAtBottom(bottom);
  };

  const toBottom = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = true;
    setAtBottom(true);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  // горячие клавиши: Ctrl/Cmd+K — новый чат, Esc — остановить ответ
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        newChat();
      } else if (e.key === "Escape" && abortRef.current) {
        abortRef.current.abort();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // ── действия ─────────────────────────────────────────────────
  const newChat = () => {
    if (streaming) return;
    setActiveId(null);
    setInput("");
    setPending(null);
    setSidebar(false);
    setFocusTick((t) => t + 1);
  };

  const selectChat = (id: string) => {
    if (streaming) return;
    const c = chats.find((x) => x.id === id);
    if (!c) return;
    setActiveId(id);
    setMode(c.mode);
    setSidebar(false);
    stick.current = true;
    setAtBottom(true);
  };

  const deleteChat = (id: string) => {
    if (streaming && id === activeId) return;
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (id === activeId) setActiveId(null);
  };

  const renameChat = (id: string, title: string) => {
    const t = title.trim();
    if (!t) return;
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title: t.slice(0, 80) } : c)));
  };

  const clearHistory = () => {
    if (streaming) return;
    setChats([]);
    setActiveId(null);
    images.current.clear();
    setSettingsOpen(false);
    flash("История очищена");
  };

  const onFile = async (file: File) => {
    try {
      const maxBytes = status?.limits.maxImageBytes ?? 1_500_000;
      setPending(await compressImage(file, maxBytes));
      setMode("vision");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Не удалось обработать фото");
    }
  };

  const changeMode = (m: Mode) => {
    setMode(m);
    if (m !== "vision" && pending) setPending(null); // фото относится только к режиму анализа
  };

  const run = async (rawText: string, image: PendingImage | null, opts: RunOpts = {}) => {
    if (streaming) return;
    const useMode: Mode = image ? "vision" : (opts.mode ?? mode);
    const text = rawText.trim() || (image ? MODES.vision.defaultImagePrompt ?? "" : "");
    if (!text) return;

    const maxChars = status?.limits.maxTextChars ?? 8000;
    if (text.length > maxChars) {
      flash(`Слишком длинный текст: максимум ${maxChars} символов`);
      return;
    }
    const baseMsgs = opts.base ?? active?.messages ?? [];
    if (useMode === "vision" && !image && !baseMsgs.some((m) => m.thumb)) {
      flash("Прикрепи фото: кнопка слева, галерея/камера или Ctrl+V");
      return;
    }

    const chatId = active?.id ?? uid();
    const userMsg: Msg = { id: uid(), role: "user", content: text, thumb: image?.thumb, mode: useMode };
    const botMsg: Msg = { id: uid(), role: "assistant", content: "", mode: useMode };
    if (image) images.current.set(userMsg.id, image.dataUrl);

    const history = baseMsgs
      .filter((m) => !m.error && m.content.trim())
      .map((m) => {
        const content = m.role === "assistant" ? stripActions(m.content) : m.content;
        return { role: m.role, content: m.thumb ? `${content}\n[к сообщению было приложено изображение]` : content };
      });

    setChats((prev) => {
      const exists = prev.some((c) => c.id === chatId);
      const list: Chat[] = exists
        ? prev
        : [{ id: chatId, title: makeTitle(rawText.trim() || text, Boolean(image)), mode: useMode, updatedAt: Date.now(), messages: [] }, ...prev];
      return list.map((c) =>
        c.id === chatId ? { ...c, mode: useMode, updatedAt: Date.now(), messages: [...(opts.base ?? c.messages), userMsg, botMsg] } : c,
      );
    });
    setActiveId(chatId);
    setMode(useMode);
    setInput("");
    setPending(null);
    setStreaming(true);
    stick.current = true;
    setAtBottom(true);

    const ac = new AbortController();
    abortRef.current = ac;
    const patch = (content: string, extra?: Partial<Msg>) =>
      setChats((prev) =>
        prev.map((c) => (c.id !== chatId ? c : { ...c, messages: c.messages.map((m) => (m.id === botMsg.id ? { ...m, content, ...extra } : m)) })),
      );

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
          level: settings.level,
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
        patch(acc ? `${acc}\n\n⚠️ Ответ прервался.` : err ? err.message : "Не удалось связаться с сервером. Проверь интернет и попробуй ещё раз.", {
          error: !acc,
        });
        if (err?.code === "quota") setUnlimitedOpen(true);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      refreshStatus();
    }
  };

  /** Последнее сообщение пользователя и всё, что было до него. */
  const lastTurn = () => {
    if (!active) return null;
    const idx = active.messages.map((m) => m.role).lastIndexOf("user");
    if (idx < 0) return null;
    return { user: active.messages[idx], base: active.messages.slice(0, idx) };
  };

  const regenerate = () => {
    const t = lastTurn();
    if (!t) return;
    const full = images.current.get(t.user.id) ?? t.user.thumb;
    const img: PendingImage | null = full ? { dataUrl: full, thumb: t.user.thumb ?? full, bytes: 0, name: "фото" } : null;
    run(t.user.content, img, { mode: t.user.mode ?? active?.mode, base: t.base });
  };

  const editLast = () => {
    const t = lastTurn();
    if (!t || !active) return;
    const full = images.current.get(t.user.id) ?? t.user.thumb;
    setChats((prev) => prev.map((c) => (c.id === active.id ? { ...c, messages: t.base } : c)));
    setInput(t.user.content);
    if (full) setPending({ dataUrl: full, thumb: t.user.thumb ?? full, bytes: Math.floor(full.length * 0.75), name: "фото" });
    setMode(t.user.mode ?? active.mode);
    setFocusTick((x) => x + 1);
  };

  const onExport = async () => {
    if (!active) return;
    const how = await exportChat(active);
    flash(how === "download" ? "Чат сохранён в файл .md" : "Чат скопирован в буфер обмена");
  };

  /** Нажатие на кнопку, которую предложил ИИ. */
  const onAction = (label: string) => {
    if (label.startsWith(PHOTO_ACTION_PREFIX)) {
      changeMode("vision");
      setPickTick((t) => t + 1); // откроет выбор фото
      return;
    }
    run(label, null, { mode: active?.mode });
  };

  const setLevel = (level: Settings["level"]) => setSettings((s) => ({ ...s, level }));

  const send = () => run(input, pending);
  const stop = () => abortRef.current?.abort();

  const msgs = active?.messages ?? [];
  const lastBotId = [...msgs].reverse().find((m) => m.role === "assistant")?.id;
  const lastUserId = [...msgs].reverse().find((m) => m.role === "user")?.id;
  const maxChars = status?.limits.maxTextChars ?? 8000;

  return (
    <div className="app">
      <div className="orbs" aria-hidden="true"><i /><i /><i /></div>
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
        onRename={renameChat}
        onCategory={setCategory}
        onUnlimited={() => {
          setUnlimitedOpen(true);
          setSidebar(false);
        }}
        onSettings={() => {
          refreshStatus();
          setSettingsOpen(true);
          setSidebar(false);
        }}
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
          {active && active.messages.length > 0 && (
            <button type="button" className="icon-btn" onClick={onExport} aria-label="Экспорт чата" title="Экспорт в Markdown" disabled={streaming}>
              <Icon name="download" size={19} />
            </button>
          )}
          <button type="button" className="icon-btn" onClick={newChat} aria-label="Новый чат" title="Новый чат (Ctrl+K)" disabled={streaming}>
            <Icon name="plus" size={20} />
          </button>
        </header>

        <div className="scroll" ref={scroller} onScroll={onScroll}>
          {msgs.length === 0 ? (
            <div className="hero">
              <div className="hero-logo">
                <span className="hero-ring" />
                <Logo size={68} />
              </div>
              <h1>ANTRACIT</h1>
              <p>{MODES[mode].hint}</p>
              <div className="level-switch" role="radiogroup" aria-label="Как объяснять">
                <span>Объяснять:</span>
                {LEVELS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    role="radio"
                    aria-checked={settings.level === l.id}
                    className={settings.level === l.id ? "is-active" : ""}
                    onClick={() => setLevel(l.id)}
                    title={l.hint}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              <ol className="howto">
                <li><b>1</b> Выбери вкладку внизу</li>
                <li><b>2</b> Напиши или кинь фото</li>
                <li><b>3</b> Жми кнопки под ответом</li>
              </ol>
              {status && !status.ready && (
                <div className="notice">Сервер ещё не настроен: не задан ни один API-ключ (см. <code>.env.example</code>).</div>
              )}
            </div>
          ) : (
            <div className="feed">
              {msgs.map((m) => (
                <MessageView
                  key={m.id}
                  msg={m}
                  streaming={streaming && m.id === msgs[msgs.length - 1].id}
                  isLastBot={!streaming && m.id === lastBotId}
                  isLastUser={!streaming && m.id === lastUserId}
                  onAction={onAction}
                  onRegenerate={regenerate}
                  onEdit={editLast}
                />
              ))}
            </div>
          )}
        </div>

        {!atBottom && msgs.length > 0 && (
          <button type="button" className="to-bottom glass" onClick={toBottom} aria-label="Вниз к последнему сообщению">
            <Icon name="down" size={18} />
          </button>
        )}

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
          focusTick={focusTick}
          pickTick={pickTick}
          onToast={flash}
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
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
