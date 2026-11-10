import { hits, hz, rolls, SCORE, STEPS, type MusicMode, type Section } from './score';
import { musicBus, noise } from './sound';

const LOOKAHEAD = 0.2;
const PUMP_MS = 50;
const TINY = 0.0001;
const LEVEL = 0.9;

/**
 * Музыка слотов — партитура `score.ts`, сыгранная синтезом на месте. Своя у
 * обычной игры (тихий лаунж) и у каждого бонуса: бесплатные спины — разгон с
 * прямой бочкой, сокровищница — маримба и гул, колесо — телешоу. Смена
 * режима ждёт следующей доли и вступает с первого такта нового цикла, так
 * что переход звучит сыгранным, а не обрезанным.
 *
 * Классический планировщик: ноты ставятся на часы контекста с запасом
 * `LOOKAHEAD`, таймер только подкладывает. Отставший (вкладка спала) не
 * догоняет пачкой, а начинает с ближайшей доли.
 */
export class SlotsMusic {
  private readonly c: AudioContext;
  private readonly out: GainNode;
  private readonly duck: GainNode;
  private readonly hall: GainNode;
  private readonly keysF: BiquadFilterNode;
  private readonly leadBus: GainNode;
  private readonly drums: GainNode;
  private mode: MusicMode = 'base';
  private pending: MusicMode | null = null;
  private step = 0;
  private next = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  static create(): SlotsMusic | null {
    const b = musicBus();
    return b ? new SlotsMusic(b.c, b.out, b.hall) : null;
  }

  private constructor(c: AudioContext, bus: AudioNode, hall: GainNode) {
    this.c = c;
    const t = c.currentTime;
    this.out = c.createGain();
    this.out.gain.setValueAtTime(0, t);
    this.out.gain.setTargetAtTime(LEVEL, t, 0.8);
    this.out.connect(bus);
    this.duck = c.createGain();
    this.duck.connect(this.out);

    this.hall = c.createGain();
    this.hall.gain.value = 0.6;
    this.hall.connect(hall);

    this.keysF = c.createBiquadFilter();
    this.keysF.type = 'lowpass';
    this.keysF.frequency.value = 1800;
    this.keysF.connect(this.duck);
    this.keysF.connect(this.hall);

    // Мелодия: сухо, в зал и в эхо на пунктирную восьмую.
    this.leadBus = c.createGain();
    this.leadBus.connect(this.duck);
    this.leadBus.connect(this.hall);
    const echo = c.createDelay(1);
    echo.delayTime.value = 0.375;
    const fb = c.createGain();
    fb.gain.value = 0.3;
    const wet = c.createGain();
    wet.gain.value = 0.3;
    this.leadBus.connect(echo);
    echo.connect(fb).connect(echo);
    echo.connect(wet).connect(this.duck);

    this.drums = c.createGain();
    this.drums.connect(this.duck);
  }

  /** Подкладывать ноты, пока вкладка на виду. */
  setAwake(on: boolean) {
    if (on && !this.timer) {
      this.timer = setInterval(this.pump, PUMP_MS);
      this.pump();
    } else if (!on && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Сменить музыку — со следующей доли, с начала цикла. */
  setMode(mode: MusicMode) {
    if (mode === (this.pending ?? this.mode)) return;
    this.pending = mode;
  }

  /** Приглушить под экран крупного выигрыша: фанфары важнее фона. */
  setDucked(on: boolean) {
    this.duck.gain.setTargetAtTime(on ? 0.3 : 1, this.c.currentTime, on ? 0.08 : 0.6);
  }

  stop() {
    this.setAwake(false);
    this.out.gain.setTargetAtTime(0, this.c.currentTime, 0.15);
    setTimeout(() => this.out.disconnect(), 1500);
  }

  private get sec(): Section {
    return SCORE[this.mode];
  }

  private stepS() {
    return 60 / this.sec.bpm / 4;
  }

  private readonly pump = () => {
    const c = this.c;
    if (c.state !== 'running') return;
    const now = c.currentTime;
    if (this.next < now) {
      this.step = Math.ceil(this.step / 4) * 4;
      this.next = now + 0.05;
    }
    while (this.next < now + LOOKAHEAD) {
      if (this.pending && this.step % 4 === 0) {
        this.mode = this.pending;
        this.pending = null;
        this.step = 0;
        this.crash(this.next);
      }
      this.play(this.step, this.next);
      this.step = (this.step + 1) % (STEPS * 4);
      this.next += this.stepS();
    }
  };

  private play(step: number, t: number) {
    const s = this.sec;
    const bar = Math.floor(step / STEPS);
    const inBar = step % STEPS;
    const chord = s.chords[bar % s.chords.length];
    const barS = STEPS * this.stepS();

    if (s.comp.includes(inBar)) {
      if (s.keys === 'pad') {
        if (inBar === 0) for (const m of chord) this.pad(m, t, barS);
      } else if (s.keys === 'epiano') {
        for (const m of chord) this.epiano(m, t, inBar === 0 ? barS * 0.5 : barS * 0.25);
      } else {
        for (const m of chord) this.stab(m, t);
      }
    }
    const b = s.bass[inBar];
    if (b !== null && b !== undefined) {
      if (s.bass808) this.bass808(chord[0] - 12 + b, t, this.stepS() * 6);
      else this.bass(chord[0] - 12 + b, t, this.stepS() * 3);
    }

    const n = s.lead[step];
    if (n !== null && n !== undefined) {
      if (s.voice === 'mallet') this.mallet(n, t);
      else if (s.voice === 'bell') this.bell(n, t);
      else this.pluck(n, t, s === SCORE.free ? 0.05 : 0.07);
    }

    if (hits(s.kick).includes(inBar)) this.kick(t, s === SCORE.base ? 0.35 : 0.55);
    if (hits(s.snare).includes(inBar)) {
      if (s.bass808) this.clap(t, 0.11);
      else this.snare(t, 0.12);
    }
    if (hits(s.hat).includes(inBar)) {
      const peak = s === SCORE.pick ? 0.045 : 0.035;
      if (rolls(s.hat).includes(inBar)) {
        const st = this.stepS();
        for (let k = 0; k < 3; k++) this.hat(t + (k * st) / 3, peak * (0.7 + 0.15 * k));
      } else this.hat(t, peak);
    }
  }

  private osc(type: OscillatorType, midi: number, t: number, detune = 0) {
    const o = this.c.createOscillator();
    o.type = type;
    o.frequency.value = hz(midi);
    o.detune.value = detune;
    return o;
  }

  /** Электропиано: синус и «зубец» на октаву выше, который быстро гаснет. */
  private epiano(midi: number, t: number, dur: number) {
    const body = this.osc('sine', midi, t);
    const tine = this.osc('sine', midi + 12, t);
    const g = this.c.createGain();
    g.gain.setValueAtTime(TINY, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.01);
    g.gain.exponentialRampToValueAtTime(TINY, t + dur + 0.6);
    const gt = this.c.createGain();
    gt.gain.setValueAtTime(0.02, t);
    gt.gain.exponentialRampToValueAtTime(TINY, t + 0.25);
    body.connect(g).connect(this.keysF);
    tine.connect(gt).connect(this.keysF);
    for (const o of [body, tine]) {
      o.start(t);
      o.stop(t + dur + 0.7);
    }
  }

  /** Пэд: два расстроенных треугольника, медленная атака, хвост в следующий такт. */
  private pad(midi: number, t: number, dur: number) {
    for (const det of [-8, 8]) {
      const o = this.osc('triangle', midi, t, det);
      const g = this.c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.03, t + 0.5);
      g.gain.setTargetAtTime(0, t + dur, 0.35);
      o.connect(g).connect(this.keysF);
      o.start(t);
      o.stop(t + dur + 1.8);
    }
  }

  /** Стаб меди: коротко, ярко, под фильтром. */
  private stab(midi: number, t: number) {
    for (const det of [-7, 7]) {
      const o = this.osc('sawtooth', midi, t, det);
      const f = this.c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(2400, t);
      f.frequency.exponentialRampToValueAtTime(700, t + 0.18);
      const g = this.c.createGain();
      g.gain.setValueAtTime(TINY, t);
      g.gain.linearRampToValueAtTime(0.018, t + 0.01);
      g.gain.exponentialRampToValueAtTime(TINY, t + 0.22);
      o.connect(f).connect(g).connect(this.duck);
      g.connect(this.hall);
      o.start(t);
      o.stop(t + 0.25);
    }
  }

  private bass(midi: number, t: number, dur: number) {
    const o = this.osc('sine', midi, t);
    const o2 = this.osc('triangle', midi + 12, t);
    const g = this.c.createGain();
    g.gain.setValueAtTime(TINY, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.01);
    g.gain.exponentialRampToValueAtTime(TINY, t + dur);
    const g2 = this.c.createGain();
    g2.gain.value = 0.15;
    o.connect(g).connect(this.duck);
    o2.connect(g2).connect(g);
    for (const x of [o, o2]) {
      x.start(t);
      x.stop(t + dur + 0.02);
    }
  }

  /**
   * 808: синус с коротким подъездом тона сверху, долгий хвост и мягкий перегруз —
   * чтобы бас был слышен и на телефоне, где саба нет (обертоны от перегруза).
   */
  private bass808(midi: number, t: number, dur: number) {
    const o = this.c.createOscillator();
    const f = hz(midi);
    o.frequency.setValueAtTime(f * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    const sat = this.c.createWaveShaper();
    sat.curve = this.drive();
    const g = this.c.createGain();
    g.gain.setValueAtTime(TINY, t);
    g.gain.linearRampToValueAtTime(0.075, t + 0.008);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.6, dur * 0.25);
    o.connect(sat).connect(g).connect(this.duck);
    o.start(t);
    o.stop(t + dur + 0.6);
  }

  private curve: Float32Array<ArrayBuffer> | null = null;
  private drive() {
    if (!this.curve) {
      const n = 1024;
      const c = new Float32Array(new ArrayBuffer(n * 4));
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        c[i] = Math.tanh(2.2 * x) / Math.tanh(2.2);
      }
      this.curve = c;
    }
    return this.curve;
  }

  /** Клэп трэпа: три коротких шумовых хлопка подряд и хвост в зал. */
  private clap(t: number, peak: number) {
    for (const [d, k] of [
      [0, 0.7],
      [0.011, 0.8],
      [0.023, 1],
    ] as const)
      this.noiseHit(t + d, 'bandpass', 1300, peak * k, d === 0.023 ? 0.14 : 0.012, d === 0.023 ? 0.6 : 0);
  }

  private pluck(midi: number, t: number, peak: number) {
    const o = this.osc('triangle', midi, t);
    const f = this.c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(600, t + 0.3);
    const g = this.c.createGain();
    g.gain.setValueAtTime(TINY, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(TINY, t + 0.4);
    o.connect(f).connect(g).connect(this.leadBus);
    o.start(t);
    o.stop(t + 0.45);
  }

  /** Маримба: основной тон и четвёртый обертон, деревянная атака. */
  private mallet(midi: number, t: number) {
    const o = this.osc('sine', midi, t);
    const o4 = this.osc('sine', midi + 24 + 0.04, t);
    const g = this.c.createGain();
    g.gain.setValueAtTime(TINY, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.004);
    g.gain.exponentialRampToValueAtTime(TINY, t + 0.7);
    const g4 = this.c.createGain();
    g4.gain.setValueAtTime(0.03, t);
    g4.gain.exponentialRampToValueAtTime(TINY, t + 0.08);
    o.connect(g).connect(this.leadBus);
    o4.connect(g4).connect(this.leadBus);
    for (const x of [o, o4]) {
      x.start(t);
      x.stop(t + 0.75);
    }
  }

  private bell(midi: number, t: number) {
    for (const [mult, peak, dur] of [
      [1, 0.05, 0.6],
      [2, 0.015, 0.3],
    ] as const) {
      const o = this.c.createOscillator();
      o.frequency.value = hz(midi) * mult;
      const g = this.c.createGain();
      g.gain.setValueAtTime(TINY, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.004);
      g.gain.exponentialRampToValueAtTime(TINY, t + dur);
      o.connect(g).connect(this.leadBus);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }

  private kick(t: number, peak: number) {
    const o = this.c.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = this.c.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(TINY, t + 0.32);
    o.connect(g).connect(this.drums);
    o.start(t);
    o.stop(t + 0.34);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, peak: number, len: number, wet = 0) {
    const n = noise(this.c);
    const f = this.c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.c.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(TINY, t + len);
    n.connect(f).connect(g).connect(this.drums);
    if (wet) {
      const s = this.c.createGain();
      s.gain.value = wet;
      g.connect(s).connect(this.hall);
    }
    n.start(t, Math.random());
    n.stop(t + len + 0.02);
  }

  private snare(t: number, peak: number) {
    this.noiseHit(t, 'bandpass', 1900, peak, 0.16, 0.5);
    const o = this.c.createOscillator();
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    const g = this.c.createGain();
    g.gain.setValueAtTime(peak * 0.8, t);
    g.gain.exponentialRampToValueAtTime(TINY, t + 0.1);
    o.connect(g).connect(this.drums);
    o.start(t);
    o.stop(t + 0.12);
  }

  private hat(t: number, peak: number) {
    this.noiseHit(t, 'highpass', 7500, peak, 0.05);
  }

  /** Тарелка на смене музыки — переход слышен как вступление. */
  private crash(t: number) {
    this.noiseHit(t, 'highpass', 5000, 0.05, 1.4, 0.6);
  }
}
