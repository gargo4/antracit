"use client";
import { useState } from "react";
import { MODES, QUICK_ACTIONS } from "../config/modes";
import type { Msg } from "../lib/types";
import { Icon, Logo } from "./Icons";
import { copyText, Markdown } from "./Markdown";

type Props = {
  msg: Msg;
  streaming: boolean; // этот ответ сейчас печатается
  showQuick: boolean; // показать «Короче / Проще» под ответом
  onQuick: (prompt: string) => void;
};

export function MessageView({ msg, streaming, showQuick, onQuick }: Props) {
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === "user";

  const copy = async () => {
    await copyText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  if (isUser) {
    return (
      <div className="msg msg-user">
        <div className="bubble bubble-user">
          {msg.thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="bubble-thumb" src={msg.thumb} alt="Прикреплённое фото" />
          )}
          {msg.content && <div className="bubble-text">{msg.content}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="msg msg-bot">
      <div className="avatar" aria-hidden="true"><Logo size={22} /></div>
      <div className="bot-col">
        <div className={`bubble bubble-bot${msg.error ? " is-error" : ""}`}>
          {msg.content ? (
            msg.error ? <div className="bubble-text">{msg.content}</div> : <Markdown text={msg.content} />
          ) : (
            <div className="typing" aria-label="ANTRACIT печатает"><i /><i /><i /></div>
          )}
          {streaming && msg.content && <span className="caret" />}
        </div>

        {!streaming && msg.content && !msg.error && (
          <div className="msg-actions">
            <button type="button" className="chip" onClick={copy}>
              <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Скопировано" : "Копировать"}
            </button>
            {showQuick &&
              QUICK_ACTIONS.map((a) => (
                <button key={a.label} type="button" className="chip chip-accent" onClick={() => onQuick(a.prompt)}>
                  {a.label}
                </button>
              ))}
          </div>
        )}
        {msg.mode && <span className="sr-only">{MODES[msg.mode].label}</span>}
      </div>
    </div>
  );
}
