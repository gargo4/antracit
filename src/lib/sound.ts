// Звуки интерфейса. Всё синтезируется на лету через Web Audio API — никаких файлов,
// нулевой вес, работает офлайн. Каждый звук — маленький «рецепт» из генераторов и шума.

export type SoundName =
  | "tap" // обычная кнопка
  | "tab" // переключение вкладки
  | "open" // шторка/окно открывается
  | "close" // шторка/окно закрывается
  | "send" // сообщение улетело
  | "receive" // ответ пришёл
  | "sos" // кнопка SOS
  | "success" // серия дней / достижение
  | "error" // ошибка
  | "photo" // фото прикреплено
  | "toggle" // переключатель
  | "delete" // удаление
  | "micOn"
  | "micOff";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let enabled = true;
let volume = 0.5;
let lastAt: Partial<Record<SoundName, number>> = {};

export function setSoundEnabled(on: boolean) {
  enabled = on;
}
export function setSoundVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = volume * 1.2;
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = volume * 1.2;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
  return ctx;
}

type ToneOpts = { type?: OscillatorType; from: number; to?: number; at?: number; dur: number; gain?: number; attack?: number };

function tone(c: AudioContext, o: ToneOpts) {
  const t0 = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.from, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
  const peak = o.gain ?? 0.3;
  const atk = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(master!);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.02);
}

type NoiseOpts = { at?: number; dur: number; gain?: number; filter: BiquadFilterType; from: number; to?: number; q?: number };

function hiss(c: AudioContext, o: NoiseOpts) {
  const t0 = c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = o.filter;
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.from, t0);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
  const g = c.createGain();
  const peak = o.gain ?? 0.2;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + o.dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t0);
  src.stop(t0 + o.dur + 0.02);
}

const RECIPES: Record<SoundName, (c: AudioContext) => void> = {
  tap: (c) => tone(c, { type: "sine", from: 1500, to: 1100, dur: 0.06, gain: 0.16 }),
  tab: (c) => {
    tone(c, { type: "triangle", from: 740, dur: 0.07, gain: 0.16 });
    tone(c, { type: "triangle", from: 988, at: 0.045, dur: 0.09, gain: 0.13 });
  },
  open: (c) => {
    hiss(c, { filter: "bandpass", from: 500, to: 2600, dur: 0.22, gain: 0.24, q: 0.9 });
    tone(c, { type: "sine", from: 420, to: 640, dur: 0.18, gain: 0.07, attack: 0.04 });
  },
  close: (c) => {
    hiss(c, { filter: "bandpass", from: 2400, to: 450, dur: 0.2, gain: 0.22, q: 0.9 });
    tone(c, { type: "sine", from: 600, to: 400, dur: 0.16, gain: 0.06, attack: 0.03 });
  },
  send: (c) => {
    tone(c, { type: "sine", from: 520, to: 1250, dur: 0.12, gain: 0.2 });
    hiss(c, { filter: "highpass", from: 3000, dur: 0.12, gain: 0.06 });
  },
  receive: (c) => {
    tone(c, { type: "triangle", from: 1319, dur: 0.22, gain: 0.12 }); // E6
    tone(c, { type: "triangle", from: 1976, at: 0.09, dur: 0.32, gain: 0.1 }); // B6
    tone(c, { type: "sine", from: 2637, at: 0.09, dur: 0.25, gain: 0.03 }); // мерцание
  },
  sos: (c) => {
    tone(c, { type: "square", from: 880, dur: 0.09, gain: 0.11 });
    tone(c, { type: "square", from: 660, at: 0.11, dur: 0.09, gain: 0.11 });
    tone(c, { type: "square", from: 880, at: 0.22, dur: 0.14, gain: 0.11 });
  },
  success: (c) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(c, { type: "triangle", from: f, at: i * 0.07, dur: 0.22, gain: 0.12 }));
    tone(c, { type: "sine", from: 2093, at: 0.28, dur: 0.4, gain: 0.05 });
  },
  error: (c) => {
    tone(c, { type: "sawtooth", from: 220, to: 140, dur: 0.18, gain: 0.07 });
    tone(c, { type: "sine", from: 110, dur: 0.2, gain: 0.12 });
  },
  photo: (c) => {
    hiss(c, { filter: "highpass", from: 2500, dur: 0.04, gain: 0.16 });
    hiss(c, { filter: "highpass", from: 1800, at: 0.07, dur: 0.05, gain: 0.13 });
    tone(c, { type: "sine", from: 1800, at: 0.02, dur: 0.06, gain: 0.05 });
  },
  toggle: (c) => {
    tone(c, { type: "triangle", from: 1100, to: 1500, dur: 0.05, gain: 0.2 });
    tone(c, { type: "sine", from: 2200, at: 0.02, dur: 0.04, gain: 0.06 });
  },
  delete: (c) => {
    tone(c, { type: "triangle", from: 600, to: 200, dur: 0.18, gain: 0.14 });
    hiss(c, { filter: "lowpass", from: 1200, to: 200, dur: 0.18, gain: 0.08 });
  },
  micOn: (c) => {
    tone(c, { type: "sine", from: 660, dur: 0.08, gain: 0.14 });
    tone(c, { type: "sine", from: 990, at: 0.08, dur: 0.1, gain: 0.14 });
  },
  micOff: (c) => {
    tone(c, { type: "sine", from: 990, dur: 0.08, gain: 0.12 });
    tone(c, { type: "sine", from: 660, at: 0.08, dur: 0.1, gain: 0.12 });
  },
};

/** Проиграть звук. Безопасно вызывать где угодно: без звука/без поддержки — просто тишина. */
export function play(name: SoundName) {
  if (!enabled || volume <= 0) return;
  const now = Date.now();
  if (now - (lastAt[name] ?? 0) < 40) return; // не дублировать один звук в один момент
  lastAt[name] = now;
  (window as unknown as { __soundLog?: string[] }).__soundLog?.push(name);
  try {
    const c = audio();
    if (!c || !master) return;
    RECIPES[name](c);
  } catch {
    /* звук — не главное, тихо игнорируем */
  }
}

/** Только для тестов: отрисовать звук без динамиков и вернуть его пиковую громкость и длительность. */
export async function __renderSound(name: SoundName): Promise<{ peak: number; seconds: number }> {
  const sr = 22050;
  const off = new OfflineAudioContext(1, sr, sr);
  const saved = { ctx, master, noise };
  ctx = off as unknown as AudioContext;
  master = off.createGain();
  master.gain.value = 0.6; // как при громкости по умолчанию
  master.connect(off.destination);
  noise = off.createBuffer(1, sr / 2, sr);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  RECIPES[name](off as unknown as AudioContext);
  ctx = saved.ctx;
  master = saved.master;
  noise = saved.noise;
  const buf = await off.startRendering();
  const data = buf.getChannelData(0);
  let peak = 0;
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
    if (a > 0.002) last = i;
  }
  return { peak, seconds: last / sr };
}

export const SOUND_NAMES = Object.keys(RECIPES) as SoundName[];
