"use client";
import { useState } from "react";
import { CATEGORIES, type Category } from "../config/modes";
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
  onRename: (id: string, title: string) => void;
  onCategory: (c: Category) => void;
  onUnlimited: () => void;
  onSettings: () => void;
};

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const diff = Math.floor((start.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
  if (diff <= 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  if (diff < 7) return "На этой неделе";
  return "Раньше";
}

export function Sidebar(p: Props) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const counts: Record<Category, number> = { all: p.chats.length, chat: 0, compress: 0, vision: 0 };
  p.chats.forEach((c) => (counts[c.mode] += 1));

  const q = query.trim().toLowerCase();
  const visible = p.chats
    .filter((c) => p.category === "all" || c.mode === p.category)
    .filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const groups: { label: string; items: Chat[] }[] = [];
  for (const c of visible) {
    const label = dayLabel(c.updatedAt);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(c);
    else groups.push({ label, items: [c] });
  }

  const quota = p.status?.quota;
  const noLimit = quota ? quota.left === null : false;
  const pct = quota && quota.left !== null && quota.limit > 0 ? Math.max(0, Math.min(100, (quota.left / quota.limit) * 100)) : 100;
  const low = quota && quota.left !== null && quota.limit > 0 && quota.left / quota.limit <= 0.2;

  const commitRename = (id: string) => {
    p.onRename(id, draft);
    setEditing(null);
  };

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

        <button type="button" className="btn-new sheen" onClick={p.onNew}>
          <Icon name="plus" /> Новый чат
        </button>

        <label className="search">
          <Icon name="search" size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по чатам" aria-label="Поиск по чатам" />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск">
              <Icon name="close" size={14} />
            </button>
          )}
        </label>

        <nav className="cats" aria-label="Разделы">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" className={`cat${p.category === c.id ? " is-active" : ""}`} onClick={() => p.onCategory(c.id)}>
              <span>{c.label}</span>
              <em>{counts[c.id]}</em>
            </button>
          ))}
        </nav>

        <div className="chat-list">
          {visible.length === 0 && <div className="empty-list">{q ? "Ничего не найдено" : "Здесь появятся твои чаты"}</div>}
          {groups.map((g) => (
            <div key={g.label} className="chat-group">
              <div className="group-label">{g.label}</div>
              {g.items.map((c) => (
                <div key={c.id} className={`chat-item${c.id === p.activeId ? " is-active" : ""}`}>
                  {editing === c.id ? (
                    <input
                      className="rename"
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => commitRename(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(c.id);
                        if (e.key === "Escape") setEditing(null);
                      }}
                      aria-label="Новое название чата"
                    />
                  ) : (
                    <button
                      type="button"
                      className="chat-open"
                      onClick={() => p.onSelect(c.id)}
                      onDoubleClick={() => {
                        setEditing(c.id);
                        setDraft(c.title);
                      }}
                      title={c.title}
                    >
                      <Icon name={c.mode === "chat" ? "chat" : c.mode === "compress" ? "compress" : "image"} size={16} />
                      <span className="chat-title">{c.title}</span>
                    </button>
                  )}
                  {editing !== c.id && (
                    <div className="chat-tools">
                      {confirmDel === c.id ? (
                        <>
                          <button type="button" className="chat-tool danger" onClick={() => { p.onDelete(c.id); setConfirmDel(null); }} aria-label="Подтвердить удаление">
                            <Icon name="check" size={15} />
                          </button>
                          <button type="button" className="chat-tool" onClick={() => setConfirmDel(null)} aria-label="Отмена">
                            <Icon name="close" size={15} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="chat-tool" onClick={() => { setEditing(c.id); setDraft(c.title); }} aria-label={`Переименовать «${c.title}»`}>
                            <Icon name="edit" size={14} />
                          </button>
                          <button type="button" className="chat-tool" onClick={() => setConfirmDel(c.id)} aria-label={`Удалить «${c.title}»`}>
                            <Icon name="trash" size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="side-foot">
          <div className={`quota${low ? " is-low" : ""}`}>
            <div className="quota-row">
              <span>Бесплатные запросы</span>
              <b>{!quota ? "…" : noLimit ? "∞" : `${quota.left} / ${quota.limit}`}</b>
            </div>
            <div className="bar">
              <i style={{ width: `${pct}%` }} />
            </div>
            <small>{noLimit ? "Лимит отключён" : "Обновляются каждые сутки"}</small>
          </div>
          <button type="button" className="btn-unlimited sheen" onClick={p.onUnlimited}>
            <Icon name="bolt" /> Безлимит
          </button>
          <button type="button" className="btn-ghost" onClick={p.onSettings}>
            <Icon name="settings" /> Настройки и ключи
          </button>
        </div>
      </aside>
    </>
  );
}
