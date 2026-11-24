"use client";
import katex from "katex";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Icon } from "./Icons";

// Лёгкий рендер markdown без внешних зависимостей и без dangerouslySetInnerHTML.
// Поддержка: заголовки, списки, цитаты, таблицы, блоки кода, **жирный**, *курсив*, `код`,
// формулы $...$ / $$...$$ и \\( \\) / \\[ \\] — через KaTeX (с запасным текстовым видом).

const TEX: [RegExp, string][] = [
  [/\\cdot/g, "·"], [/\\times/g, "×"], [/\\div/g, "÷"], [/\\pm/g, "±"], [/\\leq?/g, "≤"], [/\\geq?/g, "≥"],
  [/\\neq/g, "≠"], [/\\approx/g, "≈"], [/\\infty/g, "∞"], [/\\pi/g, "π"], [/\\alpha/g, "α"], [/\\beta/g, "β"],
  [/\\gamma/g, "γ"], [/\\delta/g, "δ"], [/\\Delta/g, "Δ"], [/\\theta/g, "θ"], [/\\lambda/g, "λ"], [/\\mu/g, "μ"],
  [/\\sigma/g, "σ"], [/\\omega/g, "ω"], [/\\Omega/g, "Ω"], [/\\sum/g, "Σ"], [/\\int/g, "∫"], [/\\to|\\rightarrow/g, "→"],
  [/\\Rightarrow/g, "⇒"], [/\\in\b/g, "∈"], [/\\sqrt\{([^}]*)\}/g, "√($1)"], [/\\sqrt/g, "√"],
  [/\\left|\\right/g, ""], [/\\,|\\;|\\!|\\qquad|\\quad/g, " "], [/\\text\{([^}]*)\}/g, "$1"], [/\\mathrm\{([^}]*)\}/g, "$1"],
];

function prettyMath(src: string): string {
  let s = src;
  for (let i = 0; i < 4; i++) s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)");
  for (const [re, to] of TEX) s = s.replace(re, to);
  return s
    .replace(/\^\{([^}]*)\}/g, (_, e: string) => toSup(e))
    .replace(/\^(\d)/g, (_, e: string) => toSup(e))
    .replace(/_\{([^}]*)\}/g, "_$1")
    .replace(/[{}]/g, "");
}

const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻", "+": "⁺", n: "ⁿ" };
function toSup(e: string): string {
  return e.split("").every((c) => c in SUP) ? e.split("").map((c) => SUP[c]).join("") : "^(" + e + ")";
}

function MathView({ tex, block }: { tex: string; block?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { throwOnError: false, displayMode: Boolean(block), output: "html", strict: "ignore" });
    } catch {
      return null;
    }
  }, [tex, block]);
  const cls = block ? "md-math md-math-block" : "md-math";
  if (html === null) return <span className={cls}>{prettyMath(tex)}</span>;
  // KaTeX экранирует ввод (trust: false по умолчанию), его HTML безопасен.
  return block ? <div className={cls} dangerouslySetInnerHTML={{ __html: html }} /> : <span className={cls} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Модели иногда пишут \\( … \\) и \\[ … \\] — приводим к $ … $ и $$ … $$. */
function normalizeMath(text: string): string {
  return text.replace(/\\\[([\s\S]*?)\\\]/g, (_, m: string) => `\n$$${m.trim()}$$\n`).replace(/\\\((.+?)\\\)/g, (_, m: string) => `$${m}$`);
}

const INLINE_SRC = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\$\$[^$]+\$\$)|(\$[^\s$](?:[^$\n]*[^\s$])?\$)|(\*[^*\s](?:[^*\n]*[^*\s])?\*)/g;

function inline(text: string, kp: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  const re = new RegExp(INLINE_SRC.source, "g"); // свой экземпляр: inline() вызывается рекурсивно
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${kp}-${n++}`;
    if (m[1]) out.push(<code key={k} className="md-code">{t.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inline(t.slice(2, -2), k)}</strong>);
    else if (m[3]) out.push(<MathView key={k} tex={t.slice(2, -2)} />);
    else if (m[4]) out.push(<MathView key={k} tex={t.slice(1, -1)} />);
    else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function lines(text: string, kp: string): ReactNode[] {
  return text.split("\n").map((l, i) => (
    <Fragment key={`${kp}-l${i}`}>
      {i > 0 && <br />}
      {inline(l, `${kp}-${i}`)}
    </Fragment>
  ));
}

export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="md-pre">
      <div className="md-pre-bar">
        <span>{lang || "code"}</span>
        <button
          type="button"
          onClick={() => {
            copyText(code);
            setOk(true);
            setTimeout(() => setOk(false), 1400);
          }}
        >
          <Icon name={ok ? "check" : "copy"} size={14} /> {ok ? "Скопировано" : "Копировать"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      ta.remove();
    }
  }
}

const isListLine = (l: string) => /^\s*([-*•]|\d+[.)])\s+/.test(l);
const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes("-");
const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

function blockStart(l: string, next?: string): boolean {
  const t = l.trim();
  return (
    t.startsWith("```") || t.startsWith("$$") || /^#{1,4}\s/.test(t) || isListLine(l) || t.startsWith(">") || /^-{3,}$/.test(t) ||
    (t.startsWith("|") && next !== undefined && isTableSep(next))
  );
}

export function Markdown({ text }: { text: string }) {
  const src = normalizeMath(text).split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < src.length) {
    const line = src[i];
    const t = line.trim();
    const key = `b${k++}`;

    if (!t) { i++; continue; }

    if (t.startsWith("```")) {
      const lang = t.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < src.length && !src[i].trim().startsWith("```")) buf.push(src[i++]);
      i++; // закрывающая ограда (при стриме её может ещё не быть)
      out.push(<CodeBlock key={key} code={buf.join("\n")} lang={lang} />);
      continue;
    }

    if (t.startsWith("$$")) {
      let body = t.slice(2);
      if (body.endsWith("$$") && body.length >= 2) { body = body.slice(0, -2); i++; }
      else {
        const buf = [body];
        i++;
        while (i < src.length && !src[i].includes("$$")) buf.push(src[i++]);
        if (i < src.length) buf.push(src[i++].replace("$$", ""));
        body = buf.join(" ");
      }
      out.push(<MathView key={key} tex={body.trim()} block />);
      continue;
    }

    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    if (h) {
      const level = h[1].length;
      const Tag = (`h${Math.min(level + 2, 6)}`) as "h3" | "h4" | "h5" | "h6";
      out.push(<Tag key={key} className="md-h">{inline(h[2], key)}</Tag>);
      i++;
      continue;
    }

    if (/^-{3,}$/.test(t)) { out.push(<hr key={key} className="md-hr" />); i++; continue; }

    if (t.startsWith(">")) {
      const buf: string[] = [];
      while (i < src.length && src[i].trim().startsWith(">")) buf.push(src[i++].trim().replace(/^>\s?/, ""));
      out.push(<blockquote key={key} className="md-quote">{lines(buf.join("\n"), key)}</blockquote>);
      continue;
    }

    if (t.startsWith("|") && i + 1 < src.length && isTableSep(src[i + 1])) {
      const head = cells(t);
      i += 2;
      const rows: string[][] = [];
      while (i < src.length && src[i].trim().startsWith("|")) rows.push(cells(src[i++]));
      out.push(
        <div key={key} className="md-table-wrap">
          <table className="md-table">
            <thead><tr>{head.map((c, j) => <th key={j}>{inline(c, `${key}h${j}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, `${key}r${ri}c${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (isListLine(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < src.length && isListLine(src[i])) items.push(src[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
      const Tag = ordered ? "ol" : "ul";
      out.push(<Tag key={key} className="md-list">{items.map((it, j) => <li key={j}>{inline(it, `${key}i${j}`)}</li>)}</Tag>);
      continue;
    }

    const buf: string[] = [];
    while (i < src.length && src[i].trim() && !(buf.length > 0 && blockStart(src[i], src[i + 1]))) buf.push(src[i++]);
    out.push(<p key={key} className="md-p">{lines(buf.join("\n"), key)}</p>);
  }

  return <div className="md">{out}</div>;
}
