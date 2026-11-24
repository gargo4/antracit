"use client";
import { memo, useState } from "react";
import { QUICK_ACTIONS } from "../config/modes";
import type { Msg } from "../lib/types";
import { Icon, Logo } from "./Icons";
import { copyText, Markdown } from "./Markdown";

type Props = {
  msg: Msg;
  streaming: boolean; // этот ответ сейчас печатается
  isLastBot: boolean; // под последним ответом — «Короче / Проще», «Ещё раз»
  isLastUser: boolean; // последнее сообщение пользователя можно изменить
  onQuick: (prompt: string) => void;
  onRegenerate: () => void;
  onEdit: () => void;
};

function MessageViewImpl({ msg, streaming, isLastBot, isLastUser, onQuick, onRegenerate, onEdit }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await copyText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  if (msg.role === "user") {
    return (
      <div className="msg msg-user">
        <div className="user-col">
          <div className="bubble bubble-user">
            {msg.thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="bubble-thumb" src={msg.thumb} alt="Прикреплённое фото" />
            )}
            {msg.content && <div className="bubble-text">{msg.content}</div>}
          </div>
          {isLastUser && (
            <div className="msg-actions msg-actions-user">
              <button type="button" className="chip chip-ghost" onClick={onEdit} title="Изменить и отправить заново">
                <Icon name="edit" size={13} /> Изменить
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="msg msg-bot">
      <div className={`avatar${streaming ? " is-live" : ""}`} aria-hidden="true">
        <Logo size={22} />
      </div>
      <div className="bot-col">
        <div className={`bubble bubble-bot${msg.error ? " is-error" : ""}`}>
          {msg.content ? (
            msg.error ? <div className="bubble-text">{msg.content}</div> : <Markdown text={msg.content} />
          ) : (
            <div className="typing" aria-label="ANTRACIT думает">
              <i />
              <i />
              <i />
              <span>Думаю…</span>
            </div>
          )}
          {streaming && msg.content && <span className="caret" />}
        </div>

        {!streaming && msg.content && (
          <div className="msg-actions">
            {!msg.error && (
              <button type="button" className="chip" onClick={copy}>
                <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Скопировано" : "Копировать"}
              </button>
            )}
            {isLastBot && (
              <button type="button" className="chip" onClick={onRegenerate} title="Сгенерировать ответ заново">
                <Icon name="refresh" size={14} /> Ещё раз
              </button>
            )}
            {isLastBot &&
              !msg.error &&
              QUICK_ACTIONS.map((a) => (
                <button key={a.label} type="button" className="chip chip-accent" onClick={() => onQuick(a.prompt)}>
                  {a.label}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Старые сообщения не перерисовываются на каждый кусок стрима (важно для длинных чатов с формулами).
// Кнопки действий есть только у последних сообщений — им нужны свежие обработчики.
export const MessageView = memo(
  MessageViewImpl,
  (a, b) =>
    a.msg === b.msg &&
    a.streaming === b.streaming &&
    a.isLastBot === b.isLastBot &&
    a.isLastUser === b.isLastUser &&
    (!(b.isLastBot || b.isLastUser) || (a.onQuick === b.onQuick && a.onRegenerate === b.onRegenerate && a.onEdit === b.onEdit)),
);
