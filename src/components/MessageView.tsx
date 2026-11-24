"use client";
import { memo, useState } from "react";
import { PHOTO_ACTION_PREFIX, QUICK_ACTIONS } from "../config/modes";
import { splitActions } from "../lib/actions";
import { msgThumbs, type Msg } from "../lib/types";
import { Icon, Logo } from "./Icons";
import { copyText, Markdown } from "./Markdown";

type Props = {
  msg: Msg;
  streaming: boolean; // этот ответ сейчас печатается
  isLastBot: boolean; // под последним ответом — «Короче / Проще», «Ещё раз»
  isLastUser: boolean; // последнее сообщение пользователя можно изменить
  onAction: (label: string) => void;
  onRegenerate: () => void;
  onEdit: () => void;
};

function MessageViewImpl({ msg, streaming, isLastBot, isLastUser, onAction, onRegenerate, onEdit }: Props) {
  const [copied, setCopied] = useState(false);
  const { text, actions } = msg.role === "assistant" ? splitActions(msg.content, streaming) : { text: msg.content, actions: [] };
  const nextSteps = actions.length ? actions : QUICK_ACTIONS.map((a) => a.prompt);

  const copy = async () => {
    await copyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  if (msg.role === "user") {
    return (
      <div className="msg msg-user">
        <div className="user-col">
          <div className="bubble bubble-user">
            {msgThumbs(msg).length > 0 && (
              <div className={`bubble-thumbs n${Math.min(msgThumbs(msg).length, 4)}`}>
                {msgThumbs(msg).map((t, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} className="bubble-thumb" src={t} alt={`Фото ${i + 1}`} />
                ))}
              </div>
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
          {text ? (
            msg.error ? <div className="bubble-text">{text}</div> : <Markdown text={text} />
          ) : (
            <div className="typing" aria-label="ANTRACIT думает">
              <i />
              <i />
              <i />
              <span>Думаю…</span>
            </div>
          )}
          {streaming && text && <span className="caret" />}
        </div>

        {isLastBot && !msg.error && msg.content && (
          <div className="next-steps" aria-label="Что дальше">
            {nextSteps.map((label) => (
              <button key={label} type="button" className={`step-btn${label.startsWith(PHOTO_ACTION_PREFIX) ? " is-photo" : ""}`} onClick={() => onAction(label)}>
                {label}
              </button>
            ))}
          </div>
        )}

        {!streaming && msg.content && (
          <div className="msg-actions">
            {!msg.error && (
              <button type="button" className="chip" onClick={copy}>
                <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Скопировано" : "Копировать"}
              </button>
            )}
            {isLastBot && (
              <button type="button" className="chip" onClick={onRegenerate} title="Ответить заново">
                <Icon name="refresh" size={14} /> {msg.error ? "Попробовать снова" : "Ещё раз"}
              </button>
            )}
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
    (!(b.isLastBot || b.isLastUser) || (a.onAction === b.onAction && a.onRegenerate === b.onRegenerate && a.onEdit === b.onEdit)),
);
