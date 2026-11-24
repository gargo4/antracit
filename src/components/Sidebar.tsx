"use client";
import { CATEGORIES, MODES, type Category } from "../config/modes";
import type { Chat, Status } from "../lib/types";
import { Icon, Logo } from "./Icons";

type Props = {
  open: boolean;
  chats: Chat[];
  activeId: string | null;
  category: Category;
  status: Status | null;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCategory: (c: Category) => void;
  onUnlimited: () => void;
  onSettings: () => void;
};

export function Sidebar(p: Props) {
  const counts: Record<Category, number> = { all: p.chats.length, chat: 0, compress: 0, vision: 0 };
  p.chats.forEach((c) => (counts[c.mode] += 1));
  const visible = p.chats
    .filter((c) => p.category === "all" || c.mode === p.category)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const q = p.status?.quota;
  const unlimitedFree = q ? q.left === null : false;
  const pct = q && q.left !== null && q.limit > 0 ? Math.max(0, Math.min(100, (q.left / q.limit) * 100)) : 100;

  return (
    <>
      <div className={`scrim${p.open ? " is-open" : ""}`} onClick={p.onClose} />
      <aside className={`sidebar glass${p.open ? " is-open" : ""}`} aria-label="Боковая панель">
        <div className="side-head">
          <div className="brand">
            <Logo size={30} />
            <span className="brand-name">ANTRACIT</span>
          </div>
          <button type="button" className="icon-btn side-close" onClick={p.onClose} aria-label="Закрыть панель">
            <Icon name="close" />
          </button>
        </div>

        <button type="button" className="btn-new" onClick={p.onNew}>
          <Icon name="plus" /> Новый чат
        </button>

        <nav className="cats" aria-label="Разделы">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`cat${p.category === c.id ? " is-active" : ""}`}
              onClick={() => p.onCategory(c.id)}
            >
              <span>{c.label}</span>
              <em>{counts[c.id]}</em>
            </button>
          ))}
        </nav>

        <div className="chat-list">
          {visible.length === 0 && <div className="empty-list">Здесь появятся твои чаты</div>}
          {visible.map((c) => (
            <div key={c.id} className={`chat-item${c.id === p.activeId ? " is-active" : ""}`}>
              <button type="button" className="chat-open" onClick={() => p.onSelect(c.id)} title={c.title}>
                <Icon name={c.mode === "chat" ? "chat" : c.mode === "compress" ? "compress" : "image"} size={16} />
                <span className="chat-title">{c.title}</span>
              </button>
              <button type="button" className="chat-del" onClick={() => p.onDelete(c.id)} aria-label={`Удалить чат «${c.title}»`}>
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="side-foot">
          <div className="quota">
            <div className="quota-row">
              <span>Бесплатные запросы</span>
              <b>{!q ? "…" : unlimitedFree ? "∞" : `${q.left} / ${q.limit}`}</b>
            </div>
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
            <small>{unlimitedFree ? "Лимит отключён" : "Обновляются каждые сутки"}</small>
          </div>
          <button type="button" className="btn-unlimited" onClick={p.onUnlimited}>
            <Icon name="bolt" /> Безлимит
          </button>
          <button type="button" className="btn-ghost" onClick={p.onSettings}>
            <Icon name="settings" /> Настройки и ключи
          </button>
          <span className="sr-only">{MODES.chat.label}</span>
        </div>
      </aside>
    </>
  );
}
