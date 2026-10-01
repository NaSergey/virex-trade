/**
 * Звуки джетпака, собранные на месте, — Web Audio без записей. Двигатель
 * обязан идти за полётом (громкость — за тягой, тон — за множителем), а
 * запись этого не умеет; зажигание собрано тем же набором. Взрыв — запись
 * (`explosion*.mp3`, Kenney Sci-Fi Sounds): синтезированный из шума, он
 * читался шипением, а не взрывом (владелец 2026-09-26). Записи играют через
 * `play` в ту же шину эффектов.
 *
 * Шины две — эффекты и музыка, у каждой своя громкость: фоновая вкладка
 * глушит обе, выключатели — каждую свою. Обе идут через компрессор: взрыв
 * поверх рёва и музыки иначе ушёл бы в перегруз.
 */

export interface Buses {
  sfx: GainNode;
  music: GainNode;
}

const buses = new WeakMap<AudioContext, Buses>();
const noises = new WeakMap<AudioContext, { white: AudioBuffer; brown: AudioBuffer }>();
const spaces = new WeakMap<AudioContext, AudioBuffer>();

export function busesOf(c: AudioContext): Buses {
  let b = buses.get(c);
  if (!b) {
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.connect(c.destination);
    const sfx = c.createGain();
    const music = c.createGain();
    sfx.connect(limiter);
    music.connect(limiter);
    b = { sfx, music };
    buses.set(c, b);
  }
  return b;
}

/** Шумы на две секунды — белый и «коричневый» (интеграл белого, глуше и ниже). */
export function noiseOf(c: AudioContext) {
  let n = noises.get(c);
  if (!n) {
    const len = 2 * c.sampleRate;
    const white = c.createBuffer(1, len, c.sampleRate);
    const brown = c.createBuffer(1, len, c.sampleRate);
    const w = white.getChannelData(0);
    const b = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * w[i]) / 1.02;
      b[i] = last * 3.5;
    }
    n = { white, brown };
    noises.set(c, n);
  }
  return n;
}

/** Импульс ревербератора: стереошум с затуханием — «зал» без записи. */
export function spaceOf(c: AudioContext, seconds = 2.8) {
  let buf = spaces.get(c);
  if (!buf) {
    const len = Math.floor(seconds * c.sampleRate);
    buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    spaces.set(c, buf);
  }
  return buf;
}

const TINY = 0.0001;

/** Спад огибающей: от `peak` в `t` экспонентой до тишины к `t + dur`. */
function decay(g: AudioParam, t: number, peak: number, dur: number, attack = 0.005) {
  g.setValueAtTime(TINY, t);
  g.linearRampToValueAtTime(peak, t + attack);
  g.exponentialRampToValueAtTime(TINY, t + dur);
}

/** Удар: синус, падающий по частоте, — «бум» зажигания. */
function thump(c: AudioContext, out: AudioNode, t: number, from: number, to: number, peak: number, dur: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6);
  decay(g.gain, t, peak, dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Шум через фильтр, срез которого едет от `from` к `to`. */
function blast(
  c: AudioContext,
  out: AudioNode,
  t: number,
  kind: BiquadFilterType,
  from: number,
  to: number,
  peak: number,
  dur: number,
  attack = 0.005,
) {
  const src = c.createBufferSource();
  src.buffer = noiseOf(c).white;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = kind;
  f.Q.value = kind === 'bandpass' ? 0.8 : 0.7;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur * 0.8);
  const g = c.createGain();
  decay(g.gain, t, peak, dur, attack);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

/** Зажигание: глухой удар и шипение, которое светлеет, пока тяга растёт. */
export function ignition(c: AudioContext, out: AudioNode) {
  const t = c.currentTime + 0.01;
  thump(c, out, t, 72, 30, 0.7, 0.9);
  blast(c, out, t, 'bandpass', 260, 1500, 0.4, 2.4, 0.12);
}

/**
 * Двигатель в полёте: коричневый шум под фильтром (рёв), две расстроенные
 * пилы (низ) и свист. Живёт от взлёта до краша; `set` зовётся с кадра.
 */
export class Engine {
  private readonly master: GainNode;
  private readonly roar: BiquadFilterNode;
  private readonly subs: OscillatorNode[];
  private readonly whine: OscillatorNode;
  private readonly sources: AudioScheduledSourceNode[];

  constructor(
    private readonly c: AudioContext,
    out: AudioNode,
  ) {
    const t = c.currentTime;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.master.connect(out);

    const noise = c.createBufferSource();
    noise.buffer = noiseOf(c).brown;
    noise.loop = true;
    this.roar = c.createBiquadFilter();
    this.roar.type = 'lowpass';
    this.roar.frequency.value = 300;
    noise.connect(this.roar).connect(this.master);

    const low = c.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 170;
    const lowGain = c.createGain();
    lowGain.gain.value = 0.35;
    low.connect(lowGain).connect(this.master);
    this.subs = [0, 7].map((cents) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 40;
      o.detune.value = cents;
      o.connect(low);
      return o;
    });

    this.whine = c.createOscillator();
    this.whine.frequency.value = 160;
    const whineGain = c.createGain();
    whineGain.gain.value = 0.05;
    this.whine.connect(whineGain).connect(this.master);

    this.sources = [noise, ...this.subs, this.whine];
    this.sources.forEach((s) => s.start(t));
  }

  set(tone: { level: number; cutoff: number; sub: number; whine: number }) {
    const t = this.c.currentTime;
    this.master.gain.setTargetAtTime(tone.level, t, 0.08);
    this.roar.frequency.setTargetAtTime(tone.cutoff, t, 0.1);
    this.subs.forEach((o) => o.frequency.setTargetAtTime(tone.sub, t, 0.2));
    this.whine.frequency.setTargetAtTime(tone.whine, t, 0.1);
  }

  /** Заглушить за `fade` секунд и отпустить узлы. */
  stop(fade = 0.08) {
    // Вперёд ничего не запланировано — `set` ставит цели на «сейчас», — и
    // новая цель просто перекрывает прежние, без щелчка отмены.
    const t = this.c.currentTime;
    this.master.gain.setTargetAtTime(0, t, fade / 3);
    this.sources.forEach((s) => s.stop(t + fade * 2));
    this.sources[0].onended = () => this.master.disconnect();
  }
}
