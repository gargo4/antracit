"use client";
import { useEffect, useState, type ReactNode } from "react";
import { KEY_LABELS } from "../config/modes";
import type { KeyChoice, Settings, Status } from "../lib/types";
import { Icon } from "./Icons";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal glass" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch${on ? " is-on" : ""}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

type SettingsProps = {
  settings: Settings;
  status: Status | null;
  onChange: (s: Settings) => void;
  onRefresh: () => void;
  onClearHistory: () => void;
  onClose: () => void;
};

export function SettingsModal({ settings, status, onChange, onRefresh, onClearHistory, onClose }: SettingsProps) {
  const choose = (c: KeyChoice) => onChange({ ...settings, keySlot: c });
  const [sure, setSure] = useState(false);
  const rows: { choice: KeyChoice; label: string; sub: string; dot: "ok" | "wait" | "off" }[] = [
    { choice: "auto", label: "Автовыбор", sub: "Сервер сам берёт первый рабочий ключ", dot: "ok" },
    ...[0, 1, 2].map((slot) => {
      const k = status?.keys.find((x) => x.slot === slot);
      const dot: "ok" | "wait" | "off" = !k?.configured ? "off" : k.available ? "ok" : "wait";
      const sub = !k ? "…" : !k.configured ? "Не задан в .env" : k.available ? "Работает" : `Отдыхает ещё ~${Math.ceil(k.cooldownSec / 60)} мин (лимит/ошибка)`;
      return { choice: slot as KeyChoice, label: KEY_LABELS[slot], sub, dot };
    }),
  ];

  return (
    <Modal title="Настройки и ключи" onClose={onClose}>
      <p className="modal-note">
        Сами ключи хранятся только на сервере (файл <code>.env</code>) — здесь выбирается, какой из них использовать.
      </p>

      <div className="key-list">
        {rows.map((r) => {
          const disabled = r.choice !== "auto" && r.dot === "off";
          return (
            <div key={String(r.choice)} className={`key-row${settings.keySlot === r.choice ? " is-active" : ""}${disabled ? " is-disabled" : ""}`}>
              <span className={`dot dot-${r.dot}`} />
              <div className="key-text">
                <b>{r.label}</b>
                <small>{r.sub}</small>
              </div>
              <Switch label={r.label} on={settings.keySlot === r.choice} onChange={(v) => v && !disabled && choose(r.choice)} />
            </div>
          );
        })}
      </div>

      <div className="key-row">
        <div className="key-text">
          <b>Автопереключение при сбое</b>
          <small>Если выбранный ключ закончился или выдал ошибку — перейти на следующий</small>
        </div>
        <Switch label="Автопереключение" on={settings.fallback} onChange={(v) => onChange({ ...settings, fallback: v })} />
      </div>

      {status?.pinRequired && (
        <label className="field">
          <span>PIN администратора (нужен для ручного выбора ключа)</span>
          <input type="password" value={settings.pin} onChange={(e) => onChange({ ...settings, pin: e.target.value })} placeholder="PIN" autoComplete="off" />
        </label>
      )}

      {status && !status.ready && (
        <div className="notice">
          На сервере не задан ни один ключ. Впиши <code>AI_KEY_1…3</code> в <code>.env.local</code> и перезапусти приложение.
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={onRefresh}>
          <Icon name="refresh" size={16} /> Обновить статус
        </button>
        <button type="button" className={`btn-ghost danger${sure ? " is-armed" : ""}`} onClick={() => (sure ? onClearHistory() : setSure(true))}>
          <Icon name="trash" size={16} /> {sure ? "Точно удалить всё?" : "Очистить историю"}
        </button>
      </div>
      {status && <small className="modal-foot">Модель: {status.model}</small>}
    </Modal>
  );
}

export function UnlimitedModal({ status, onClose }: { status: Status | null; onClose: () => void }) {
  const free = status?.quota.limit ? `${status.quota.limit} запросов в сутки` : "Без ограничений";
  return (
    <Modal title="Безлимит" onClose={onClose}>
      <p className="modal-note">Тарифы появятся совсем скоро. Сейчас оплата не подключена — это заглушка под будущую интеграцию.</p>
      <div className="plans">
        <div className="plan">
          <h3>Бесплатно</h3>
          <div className="price">0 ₽</div>
          <ul>
            <li>{free}</li>
            <li>Все три режима</li>
            <li>История чатов на устройстве</li>
          </ul>
          <button type="button" className="btn-ghost" disabled>Ваш тариф</button>
        </div>
        <div className="plan plan-pro">
          <span className="plan-badge">Скоро</span>
          <h3>Безлимит</h3>
          <div className="price">— ₽ <small>/ мес</small></div>
          <ul>
            <li>Без дневного лимита запросов</li>
            <li>Приоритет в очереди</li>
            <li>Увеличенный размер текста и фото</li>
          </ul>
          <button type="button" className="btn-unlimited" disabled>
            <Icon name="bolt" /> Оплата скоро
          </button>
        </div>
      </div>
    </Modal>
  );
}
