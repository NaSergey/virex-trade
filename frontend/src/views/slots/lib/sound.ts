import { audioContext } from '@/shared/lib/sound/player';
import { hz, penta } from './score';

/**
 * Звук автомата — синтез на Web Audio, записей нет. Эффекты играют нотами
 * пентатоники до мажора, той же тональности, что музыка (`score.ts`):
 * перезвон выигрыша поверх фона ложится в аккорд, а не режет его. Тембры —
 * колокольчик (синус с обертонами), щипок и мягкая медь; квадратных
 * «писков» и пил без фильтра нет.
 *
 * Шины две — эффекты и музыка, у каждой своя громкость. Обе идут в общий
 * зал (свёртка) и через лимитер: десяток звуков крупного выигрыша поверх
 * музыки не должен хрипеть.
 */

interface Mixer {
  c: AudioContext;
  sfx: GainNode;
  music: GainNode;
  /** Посыл в зал: подключать параллельно сухому выходу. */
  hall: GainNode;
}

let mixer: Mixer | null = null;
let noiseBuf: AudioBuffer | null = null;
let sfxGain = 0.64;

function mix(): Mixer | null {
  const c = audioContext();
  if (!c) return null;
  if (!mixer || mixer.c !== c) {
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -12;
    lim.knee.value = 8;
    lim.ratio.value = 10;
    lim.attack.value = 0.003;
    lim.release.value = 0.25;
    lim.connect(c.destination);

    const verb = c.createConvolver();
    verb.buffer = hallOf(c);
    const wet = c.createGain();
    wet.gain.value = 0.5;
    verb.connect(wet).connect(lim);
    const hall = c.createGain();
    hall.connect(verb);

    const sfx = c.createGain();
    sfx.gain.value = sfxGain;
    sfx.connect(lim);
    const music = c.createGain();
    music.gain.value = 0;
    music.connect(lim);
    mixer = { c, sfx, music, hall };
  }
  return mixer;
}

function out(): { c: AudioContext; o: GainNode; h: GainNode } | null {
  const m = mix();
  if (!m || m.c.state !== 'running') return null;
  return { c: m.c, o: m.sfx, h: m.hall };
}

/** Шина музыки и зал — для `music.ts`. */
export function musicBus() {
  const m = mix();
  return m ? { c: m.c, out: m.music, hall: m.hall } : null;
}

export function setVolume(gain: number) {
  sfxGain = gain;
  const m = mix();
  if (m) m.sfx.gain.setTargetAtTime(gain, m.c.currentTime, 0.05);
}

/** Зал на 2,2 с: затухающий шум, у правого канала свой — стерео шире. */
function hallOf(c: AudioContext) {
  const len = Math.floor(2.2 * c.sampleRate);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  return buf;
}

export function noise(c: AudioContext) {
  if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  return s;
}

function env(c: AudioContext, at: number, peak: number, attack: number, decay: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  return g;
}

/** Одна нота: осциллятор с огибающей, сухо и в зал (`wet` — доля посыла). */
function tone(type: OscillatorType, freq: number, at: number, peak: number, decay: number, to?: number, wet = 0.3) {
  const b = out();
  if (!b) return;
  const { c, o, h } = b;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + decay);
  const g = env(c, at, peak, 0.005, decay);
  osc.connect(g).connect(o);
  if (wet > 0) {
    const s = c.createGain();
    s.gain.value = wet;
    g.connect(s).connect(h);
  }
  osc.start(at);
  osc.stop(at + decay + 0.05);
}

/** Колокольчик: основной тон и два обертона, верхние гаснут быстрее. */
function bell(midi: number, at: number, peak: number, decay = 0.9) {
  const f = hz(midi);
  tone('sine', f, at, peak, decay, undefined, 0.45);
  tone('sine', f * 2, at, peak * 0.35, decay * 0.5, undefined, 0.45);
  tone('sine', f * 3.01, at, peak * 0.12, decay * 0.25, undefined, 0.45);
}

/** Щипок: треугольник через фильтр, который быстро закрывается. */
function pluck(midi: number, at: number, peak: number, decay = 0.35) {
  const b = out();
  if (!b) return;
  const { c, o, h } = b;
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = hz(midi);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(4000, at);
  f.frequency.exponentialRampToValueAtTime(500, at + decay);
  const g = env(c, at, peak, 0.004, decay);
  osc.connect(f).connect(g).connect(o);
  const s = c.createGain();
  s.gain.value = 0.35;
  g.connect(s).connect(h);
  osc.start(at);
  osc.stop(at + decay + 0.05);
}

/** Короткий шумовой щелчок — механика, а не писк. */
function click(at: number, freq: number, peak: number, len = 0.03) {
  const b = out();
  if (!b) return;
  const { c, o } = b;
  const n = noise(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 3;
  const g = env(c, at, peak, 0.002, len);
  n.connect(f).connect(g).connect(o);
  n.start(at, Math.random());
  n.stop(at + len + 0.02);
}

/** Мягкая медь: две расстроенные пилы под фильтром, атака не мгновенная. */
function brass(midis: number[], at: number, len: number, peak: number) {
  const b = out();
  if (!b) return;
  const { c, o, h } = b;
  for (const midi of midis) {
    for (const det of [-7, 7]) {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = hz(midi);
      osc.detune.value = det;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.7;
      lp.frequency.setValueAtTime(600, at);
      lp.frequency.exponentialRampToValueAtTime(2600, at + 0.07);
      lp.frequency.exponentialRampToValueAtTime(1400, at + len);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.04);
      g.gain.setValueAtTime(peak, at + Math.max(0.05, len - 0.15));
      g.gain.exponentialRampToValueAtTime(0.0001, at + len + 0.35);
      osc.connect(lp).connect(g).connect(o);
      const s = c.createGain();
      s.gain.value = 0.4;
      g.connect(s).connect(h);
      osc.start(at);
      osc.stop(at + len + 0.4);
    }
  }
}

/** Удар литавры: низкий синус с падением тона. */
function boom(at: number, peak = 0.6, decay = 0.7) {
  tone('sine', 82, at, peak, decay, 41, 0.2);
}

const now = () => {
  const b = out();
  return b ? b.c.currentTime : 0;
};

/**
 * Пуск — как отправка ордера в терминале: щелчок и два быстрых цифровых блипа
 * вверх (квинта), фильтрованный квадрат, без свиста.
 */
export function spinStart() {
  const t = now();
  if (!t) return;
  click(t, 3000, 0.12, 0.015);
  blip(76, t + 0.01, 0.07, 0.07);
  blip(83, t + 0.08, 0.06, 0.09);
}

/** Цифровой блип: квадрат под закрывающимся фильтром — «звук терминала», а не колокольчик. */
function blip(midi: number, at: number, peak: number, decay: number, wet = 0.15) {
  const b = out();
  if (!b) return;
  const { c, o, h } = b;
  const osc = c.createOscillator();
  osc.type = 'square';
  osc.frequency.value = hz(midi);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 4;
  f.frequency.setValueAtTime(5000, at);
  f.frequency.exponentialRampToValueAtTime(900, at + decay);
  const g = env(c, at, peak, 0.002, decay);
  osc.connect(f).connect(g).connect(o);
  if (wet) {
    const s = c.createGain();
    s.gain.value = wet;
    g.connect(s).connect(h);
  }
  osc.start(at);
  osc.stop(at + decay + 0.03);
}

/**
 * Барабаны крутятся — лента котировок: быстрые короткие цифровые блипы, высота
 * которых бродит по пентатонике с уклоном вверх, как тики цены на памп. Чем
 * больше барабанов крутится, тем чаще тики. Низов, пэда и «звёздочек» нет:
 * космос владелец снял 2026-11-10 («больше в крипто уклон»), тиканье с низким
 * шорохом — «будто движок завожу». `set` зовётся каждый кадр, `stop` гасит.
 */
export function reelHum() {
  const b = out();
  if (!b) return { set: () => {}, stop: () => {} };
  const { c } = b;
  let reels = 0;
  let next = c.currentTime + 0.04;
  let step = 3;
  const timer = setInterval(() => {
    if (c.state !== 'running' || reels === 0) {
      next = Math.max(next, c.currentTime + 0.03);
      return;
    }
    while (next < c.currentTime + 0.1) {
      // Случайное блуждание с уклоном вверх; упёрлось в потолок — откат, как коррекция.
      step += Math.random() < 0.62 ? 1 : -1;
      if (step > 11) step = 5;
      if (step < 0) step = 2;
      blip(penta(step, 60), next, 0.022 + 0.004 * reels, 0.045, 0.1);
      next += 1 / (8 + 2.5 * reels);
    }
  }, 25);
  return {
    set: (r: number) => {
      reels = r;
    },
    stop: () => {
      clearInterval(timer);
      reels = 0;
    },
  };
}

/** Барабан встал: «ордер исполнен» — блип вниз и короткий щелчок фиксации. */
export function reelStop(i: number) {
  const t = now();
  if (!t) return;
  blip(penta(8 - i, 60), t, 0.09, 0.09);
  tone('sine', 90, t, 0.12, 0.08, 60, 0);
  click(t, 3200, 0.08, 0.015);
}

/** Встал скаттер: колокольчик, каждый следующий — ступенью выше. */
export function scatterLand(n: number) {
  const t = now();
  if (!t) return;
  const top = penta(2 + 2 * Math.min(n, 5));
  bell(top, t, 0.22, 1.1);
  bell(top - 12, t + 0.03, 0.1, 0.9);
}

/**
 * Предвкушение: дрожащий аккорд (ля минор) нарастает и светлеет, пока
 * горит барабан, — напряжение без воя пилы.
 */
export function tease(ms: number) {
  const b = out();
  if (!b) return;
  const { c, o, h } = b;
  const t = c.currentTime;
  const d = ms / 1000;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(400, t);
  f.frequency.exponentialRampToValueAtTime(3000, t + d);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + d * 0.9);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.25);
  const trem = c.createOscillator();
  trem.frequency.setValueAtTime(5, t);
  trem.frequency.linearRampToValueAtTime(11, t + d);
  const tremDepth = c.createGain();
  tremDepth.gain.value = 0.4;
  const am = c.createGain();
  am.gain.value = 0.6;
  trem.connect(tremDepth).connect(am.gain);
  f.connect(am).connect(g).connect(o);
  g.connect(h);
  const oscs = [57, 64, 69, 72].map((midi) => {
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(hz(midi), t);
    osc.frequency.exponentialRampToValueAtTime(hz(midi + 2), t + d);
    osc.connect(f);
    return osc;
  });
  for (const osc of [...oscs, trem]) {
    osc.start(t);
    osc.stop(t + d + 0.3);
  }
}

/** Выигрыш: колокольчики вверх по пентатонике, длиннее и выше у крупного. */
export function winChime(steps: number) {
  const t = now();
  if (!t) return;
  for (let i = 0; i < steps; i++) bell(penta(i), t + i * 0.085, 0.16, 0.8);
  if (steps >= 5) bell(penta(steps), t + steps * 0.085, 0.2, 1.6);
}

/** Тиканье счётчика выигрыша: мягкий щелчок, чуть выше к концу. */
export function countTick(u: number) {
  const t = now();
  if (!t) return;
  click(t, 2200 + u * 1600, 0.09, 0.02);
}

/** Звон монеты — металл: негармоничные частоты с быстрым спадом. */
export function coin() {
  const t = now();
  if (!t) return;
  const f = 2400 + Math.random() * 700;
  tone('sine', f, t, 0.05, 0.2, undefined, 0.2);
  tone('sine', f * 1.47, t, 0.03, 0.14, undefined, 0.2);
  tone('sine', f * 2.13, t, 0.015, 0.09, undefined, 0.2);
}

/**
 * Фанфары: IV → V → I в до мажоре, медь и колокольчики сверху. `level` —
 * длиннее и выше у большего.
 */
export function fanfare(level: number) {
  const t = now();
  if (!t) return;
  const chords = [
    [53, 57, 60, 65],
    [55, 59, 62, 67],
    [57, 60, 64, 69],
    [60, 64, 67, 72],
  ];
  const seqs = level >= 2 ? [chords[0], chords[1], chords[3]] : level === 1 ? [chords[1], chords[3]] : [chords[3]];
  seqs.forEach((ch, k) => {
    const at = t + k * 0.2;
    const last = k === seqs.length - 1;
    brass(ch, at, last ? 1.2 : 0.16, 0.035);
    if (last) {
      bell(84, at, 0.14, 1.6);
      bell(88, at + 0.06, 0.1, 1.4);
      bell(91, at + 0.12, 0.1, 1.4);
    }
  });
  boom(t + (seqs.length - 1) * 0.2, 0.45, 0.9);
}

/** Вход в бонус: глиссандо арфы вверх по пентатонике и удар. */
export function bonusStart() {
  const t = now();
  if (!t) return;
  for (let i = 0; i < 14; i++) pluck(penta(i, 60), t + i * 0.04, 0.12, 0.5);
  boom(t + 0.6, 0.6, 1);
  brass([60, 64, 67, 72], t + 0.6, 0.9, 0.03);
  bell(96, t + 0.6, 0.12, 1.8);
}

/** Сундук открылся: стук крышки и звон — выше и дольше у крупного приза. */
export function chestOpen(value: number) {
  const t = now();
  if (!t) return;
  click(t, 900, 0.3, 0.06);
  tone('sine', 180, t, 0.25, 0.12, 90, 0);
  const steps = 2 + Math.min(5, Math.floor(Math.log2(1 + value)));
  for (let i = 0; i < steps; i++) bell(penta(i + 2), t + 0.1 + i * 0.06, 0.13, 0.7);
}

/** «Забрать»: каденция соль → до, бонус закрыт. */
export function collect() {
  const t = now();
  if (!t) return;
  bell(79, t, 0.16, 0.5);
  bell(84, t + 0.16, 0.2, 1.3);
  bell(76, t + 0.16, 0.1, 1.2);
}

/** Язычок колеса задел штырь: деревянный щелчок. */
export function wheelTick() {
  const t = now();
  if (!t) return;
  click(t, 1800 + Math.random() * 300, 0.18, 0.025);
}

/** Символ линии «ожил»: колокольчик, каждый следующий ступенью выше. */
export function cellDing(k: number) {
  const t = now();
  if (!t) return;
  bell(penta(k + 2), t, 0.12, 0.6);
}

/** Сердцебиение под горящим барабаном: глухие двойные удары. */
export function heartbeat(ms: number) {
  const t = now();
  if (!t) return;
  for (let at = 0; at < ms / 1000; at += 0.62) {
    tone('sine', 62, t + at, 0.45, 0.16, 42, 0);
    tone('sine', 56, t + at + 0.2, 0.3, 0.18, 40, 0);
  }
}

/** Гром — молния бонуса: шум с закрывающимся фильтром и низкий раскат. */
export function thunder() {
  const b = out();
  if (!b) return;
  const { c, o, h } = b;
  const t = c.currentTime;
  const n = noise(c);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(1400, t);
  f.frequency.exponentialRampToValueAtTime(100, t + 1.2);
  const g = env(c, t, 0.5, 0.01, 1.4);
  n.connect(f).connect(g).connect(o);
  g.connect(h);
  n.start(t);
  n.stop(t + 1.6);
  tone('sine', 50, t, 0.5, 1.2, 30, 0);
}

/** Новая ступень крупного выигрыша: взлёт по пентатонике и фанфары. */
export function levelUp(level: number) {
  const t = now();
  if (!t) return;
  for (let i = 0; i < 8; i++) pluck(penta(i + level * 2, 60), t + i * 0.035, 0.1, 0.3);
  fanfare(Math.min(2, level));
}

/** Хлопок ракеты фейерверка: шумовой удар. */
export function pop() {
  const t = now();
  if (!t) return;
  click(t, 500 + Math.random() * 300, 0.25, 0.08);
}
