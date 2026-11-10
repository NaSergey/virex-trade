import { audioContext } from '@/shared/lib/sound/player';

/**
 * Звук автомата — синтез на Web Audio, записей нет (тот же приём, что у
 * двигателя джетпака): гул ленты, удар барабана об упор, нарастание
 * предвкушения, перезвон выигрыша и фанфары. Всё идёт через одну шину с
 * громкостью канала и лимитером — десяток наложенных звуков крупного
 * выигрыша не должен хрипеть.
 */

let bus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function out(): { c: AudioContext; o: GainNode } | null {
  const c = audioContext();
  if (!c || c.state !== 'running') return null;
  if (!bus || bus.context !== c) {
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -10;
    lim.ratio.value = 12;
    lim.attack.value = 0.003;
    lim.release.value = 0.2;
    lim.connect(c.destination);
    bus = c.createGain();
    bus.gain.value = 0.6;
    bus.connect(lim);
  }
  return { c, o: bus };
}

export function setVolume(gain: number) {
  const b = out();
  if (b) b.o.gain.setTargetAtTime(gain, b.c.currentTime, 0.05);
}

function noise(c: AudioContext) {
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

function tone(type: OscillatorType, freq: number, at: number, peak: number, decay: number, to?: number) {
  const b = out();
  if (!b) return;
  const { c, o } = b;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + decay);
  const g = env(c, at, peak, 0.005, decay);
  osc.connect(g).connect(o);
  osc.start(at);
  osc.stop(at + decay + 0.05);
}

const now = () => out()?.c.currentTime ?? 0;

/** Рычаг и пуск: щелчок механизма и свист разгона. */
export function spinStart() {
  const b = out();
  if (!b) return;
  const { c, o } = b;
  const t = c.currentTime;
  tone('square', 1800, t, 0.12, 0.03);
  const n = noise(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 2;
  f.frequency.setValueAtTime(400, t);
  f.frequency.exponentialRampToValueAtTime(2400, t + 0.35);
  const g = env(c, t, 0.25, 0.08, 0.4);
  n.connect(f).connect(g).connect(o);
  n.start(t);
  n.stop(t + 0.6);
}

/**
 * Гул ленты, пока барабаны крутятся: шум через полосовой фильтр с
 * дребезгом — как лента по роликам. Возвращает ручку: число крутящихся
 * барабанов меняет громкость, `stop` — тишина.
 */
export function reelHum() {
  const b = out();
  if (!b) return { set: () => {}, stop: () => {} };
  const { c, o } = b;
  const n = noise(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 900;
  f.Q.value = 0.9;
  const rattle = c.createOscillator();
  rattle.frequency.value = 38;
  const depth = c.createGain();
  depth.gain.value = 0.5;
  const g = c.createGain();
  g.gain.value = 0;
  const am = c.createGain();
  am.gain.value = 0.5;
  rattle.connect(depth).connect(am.gain);
  n.connect(f).connect(am).connect(g).connect(o);
  n.start();
  rattle.start();
  return {
    set: (reels: number) => g.gain.setTargetAtTime(0.05 * reels, c.currentTime, 0.04),
    stop: () => {
      g.gain.setTargetAtTime(0, c.currentTime, 0.05);
      n.stop(c.currentTime + 0.4);
      rattle.stop(c.currentTime + 0.4);
    },
  };
}

/** Барабан встал: глухой удар об упор и щелчок фиксатора. */
export function reelStop(i: number) {
  const t = now();
  if (!t) return;
  tone('sine', 140 - i * 6, t, 0.55, 0.18, 48);
  tone('triangle', 2400, t, 0.08, 0.025);
}

/** Встал скаттер: звон выше с каждым следующим. */
export function scatterLand(n: number) {
  const t = now();
  if (!t) return;
  const base = [659, 784, 988, 1175, 1319][Math.min(n, 5) - 1] ?? 659;
  tone('sine', base, t, 0.3, 0.6);
  tone('sine', base * 2, t + 0.02, 0.12, 0.5);
  tone('triangle', base * 1.5, t + 0.06, 0.1, 0.4);
}

/** Предвкушение: нарастающий гул с подъёмом тона, пока горит барабан. */
export function tease(ms: number) {
  const b = out();
  if (!b) return;
  const { c, o } = b;
  const t = c.currentTime;
  const d = ms / 1000;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.exponentialRampToValueAtTime(440, t + d);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(3200, t + d);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.14, t + d * 0.9);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.1);
  osc.connect(f).connect(g).connect(o);
  osc.start(t);
  osc.stop(t + d + 0.15);
}

const MAJOR = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];

/** Выигрыш: арпеджио колокольчиков, длиннее и выше у крупного. */
export function winChime(steps: number) {
  const t = now();
  if (!t) return;
  for (let i = 0; i < steps; i++) {
    const f = MAJOR[i % MAJOR.length] * (i >= MAJOR.length ? 2 : 1);
    tone('sine', f, t + i * 0.075, 0.22, 0.5);
    tone('sine', f * 3, t + i * 0.075, 0.04, 0.25);
  }
}

/** Тиканье счётчика выигрыша. */
export function countTick(u: number) {
  const t = now();
  if (!t) return;
  tone('square', 1400 + u * 1400, t, 0.035, 0.03);
}

/** Звон монеты — металл: несколько негармоничных частот с быстрым спадом. */
export function coin() {
  const t = now();
  if (!t) return;
  const f = 2600 + Math.random() * 900;
  tone('sine', f, t, 0.09, 0.22);
  tone('sine', f * 1.47, t, 0.05, 0.16);
  tone('sine', f * 2.13, t, 0.03, 0.1);
}

/** Фанфары крупного выигрыша: аккорды медью вверх по тонике. */
export function fanfare(level: number) {
  const b = out();
  if (!b) return;
  const { c, o } = b;
  const t = c.currentTime;
  const chords = [
    [261.6, 329.6, 392],
    [349.2, 440, 523.3],
    [392, 493.9, 587.3],
    [523.3, 659.3, 784],
  ].slice(0, 2 + level);
  chords.forEach((ch, k) => {
    const at = t + k * 0.22;
    const len = k === chords.length - 1 ? 1.4 : 0.26;
    for (const f of ch) {
      for (const det of [-6, 6]) {
        const osc = c.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = det;
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(800, at);
        lp.frequency.exponentialRampToValueAtTime(4200, at + 0.08);
        const g = env(c, at, 0.06, 0.03, len);
        osc.connect(lp).connect(g).connect(o);
        osc.start(at);
        osc.stop(at + len + 0.1);
      }
    }
  });
  // Удар литавры под первый аккорд.
  tone('sine', 90, t, 0.6, 0.6, 40);
}

/** Вход в бонус: восходящий глиссандо и удар — свет в зале меняется. */
export function bonusStart() {
  const t = now();
  if (!t) return;
  for (let i = 0; i < 12; i++) tone('triangle', 330 * 2 ** (i / 6), t + i * 0.045, 0.12, 0.25);
  tone('sine', 70, t + 0.55, 0.7, 0.8, 35);
  winChime(6);
}

/** Сундук открылся: скрип крышки и звон. */
export function chestOpen(value: number) {
  const t = now();
  if (!t) return;
  tone('sawtooth', 180, t, 0.05, 0.18, 320);
  const step = Math.min(5, Math.floor(Math.log2(1 + value)));
  for (let i = 0; i <= step; i++) tone('sine', 880 * 2 ** (i / 4), t + 0.12 + i * 0.06, 0.18, 0.35);
}

/** «Забрать» — сундук пуст, бонус кончился: два тона вниз. */
export function collect() {
  const t = now();
  if (!t) return;
  tone('square', 520, t, 0.08, 0.18);
  tone('square', 390, t + 0.16, 0.08, 0.3);
}

/** Язычок колеса задел штырь. */
export function wheelTick() {
  const t = now();
  if (!t) return;
  tone('square', 2200, t, 0.05, 0.018);
}

/** Символ линии «ожил»: колокольчик, каждый следующий выше. */
export function cellDing(k: number) {
  const t = now();
  if (!t) return;
  const f = MAJOR[k % MAJOR.length] * (k >= MAJOR.length ? 2 : 1);
  tone('sine', f, t, 0.16, 0.4);
  tone('triangle', f * 2, t, 0.05, 0.2);
}

/** Сердцебиение под горящим барабаном: глухие двойные удары. */
export function heartbeat(ms: number) {
  const t = now();
  if (!t) return;
  for (let at = 0; at < ms / 1000; at += 0.62) {
    tone('sine', 60, t + at, 0.5, 0.16, 40);
    tone('sine', 55, t + at + 0.2, 0.35, 0.18, 38);
  }
}

/** Гром — молния бонуса: шум с низким фильтром и раскатом. */
export function thunder() {
  const b = out();
  if (!b) return;
  const { c, o } = b;
  const t = c.currentTime;
  const n = noise(c);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(1800, t);
  f.frequency.exponentialRampToValueAtTime(120, t + 1.2);
  const g = env(c, t, 0.8, 0.01, 1.4);
  n.connect(f).connect(g).connect(o);
  n.start(t);
  n.stop(t + 1.6);
  tone('sine', 50, t, 0.7, 1.2, 30);
}

/** Повышение ступени крупного выигрыша: взлёт тона и удар. */
export function levelUp(level: number) {
  const t = now();
  if (!t) return;
  const base = 330 * 2 ** (level / 3);
  for (let i = 0; i < 8; i++) tone('sawtooth', base * 2 ** (i / 8), t + i * 0.035, 0.07, 0.12);
  tone('sine', 80, t + 0.3, 0.8, 0.7, 40);
  fanfare(Math.min(2, level));
}

/** Хлопок ракеты фейерверка. */
export function pop() {
  const t = now();
  if (!t) return;
  tone('square', 160 + Math.random() * 80, t, 0.12, 0.08, 60);
}
