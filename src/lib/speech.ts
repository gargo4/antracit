// Озвучка ответа голосом браузера (Web Speech API). Где её нет — кнопка «Озвучить» не показывается.

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/** Markdown/формулы → обычный текст, который приятно слушать. */
export function toSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " (тут пример кода) ")
    .replace(/\$\$([\s\S]*?)\$\$/g, " (формула) ")
    .replace(/\$([^$\n]+)\$/g, (_, f: string) => (f.length <= 12 ? f.replace(/\\[a-z]+/gi, " ") : " (формула) "))
    .replace(/^\s*\|.*\|\s*$/gm, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_`>~]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

let current: (() => void) | null = null;

/** Читает текст вслух по-русски. Возвращает функцию «стоп». onEnd вызывается в конце или при остановке. */
export function speak(text: string, onEnd: () => void): () => void {
  current?.();
  const synth = window.speechSynthesis;
  synth.cancel();
  // длинный текст режем на куски — иначе некоторые браузеры обрывают на середине
  const parts: string[] = [];
  for (const sentence of toSpeech(text).split(/(?<=[.!?])\s+/)) {
    const last = parts[parts.length - 1];
    if (last && last.length + sentence.length < 220) parts[parts.length - 1] = `${last} ${sentence}`;
    else parts.push(sentence);
  }
  const voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith("ru"));
  let stopped = false;
  let i = 0;
  const finish = () => {
    if (current === stop) current = null;
    onEnd();
  };
  const next = () => {
    if (stopped) return;
    if (i >= parts.length) return finish();
    const u = new SpeechSynthesisUtterance(parts[i++].trim().replace(/(\d)\.(\d)/g, "$1,$2")); // 0.5 → «ноль целых пять»
    u.lang = "ru-RU";
    if (voice) u.voice = voice;
    u.rate = 1;
    u.onend = next;
    u.onerror = () => finish();
    synth.speak(u);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    synth.cancel();
    finish();
  };
  current = stop;
  next();
  return stop;
}
