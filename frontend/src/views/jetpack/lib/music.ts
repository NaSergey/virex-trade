import { arpAt, bassAt, chordAt, CHORD_STEPS, hz, STEP_S } from './sound';
import { noiseOf, spaceOf } from './synth';

/** Насколько вперёд ставятся ноты и как часто — классический планировщик Web Audio. */
const LOOKAHEAD = 0.25;
const PUMP_MS = 60;
const TINY = 0.0001;

/**
 * Музыка джетпака — синтвейв, собранный на месте: пэд, бас восьмыми,
 * арпеджио через эхо и бит. Записи нет намеренно: музыка следует за раундом.
 * В окне ставок — пэд, бас и тихое арпеджио; на взлёте арпеджио выходит
 * вперёд и вступает бит, а чем выше ракета, тем ярче арпеджио (`setDrive`).
 * Краш снимает бит сразу — музыка сама говорит, что раунд кончился.
 *
 * Ноты ставятся на часы контекста с запасом `LOOKAHEAD`, таймер только
 * подкладывает их. Отставший планировщик (вкладка спала, контекст стоял) не
 * догоняет пачкой, а начинает со следующего аккорда.
 */
export class Music {
  private readonly out: GainNode;
  private readonly mix: GainNode;
  private readonly verb: ConvolverNode;
  private readonly pad: BiquadFilterNode;
  private readonly bass: BiquadFilterNode;
  private readonly arpTone: BiquadFilterNode;
  private readonly arpBus: GainNode;
  private readonly drums: GainNode;
  private step = 0;
  private next = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private flying = false;

  constructor(
    private readonly c: AudioContext,
    bus: AudioNode,
  ) {
    const t = c.currentTime;
    this.out = c.createGain();
    this.out.gain.setValueAtTime(0, t);
    this.out.gain.setTargetAtTime(0.42, t, 0.6);
    this.out.connect(bus);

    this.mix = c.createGain();
    this.mix.connect(this.out);
    this.verb = c.createConvolver();
    this.verb.buffer = spaceOf(c);
    const wet = c.createGain();
    wet.gain.value = 0.4;
    this.verb.connect(wet).connect(this.out);

    this.pad = c.createBiquadFilter();
    this.pad.type = 'lowpass';
    this.pad.frequency.value = 1100;
    this.pad.Q.value = 0.5;
    this.pad.connect(this.mix);
    this.pad.connect(this.verb);

    this.bass = c.createBiquadFilter();
    this.bass.type = 'lowpass';
    this.bass.frequency.value = 340;
    this.bass.connect(this.mix);

    // Арпеджио: фильтр → своя громкость → сухо, в эхо (пунктирная восьмая) и в зал.
    this.arpTone = c.createBiquadFilter();
    this.arpTone.type = 'lowpass';
    this.arpTone.frequency.value = 900;
    this.arpBus = c.createGain();
    this.arpBus.gain.value = 0.3;
    this.arpTone.connect(this.arpBus);
    this.arpBus.connect(this.mix);
    this.arpBus.connect(this.verb);
    const echo = c.createDelay(1);
    echo.delayTime.value = 3 * STEP_S;
    const feedback = c.createGain();
    feedback.gain.value = 0.35;
    const echoOut = c.createGain();
    echoOut.gain.value = 0.35;
    this.arpBus.connect(echo);
    echo.connect(feedback).connect(echo);
    echo.connect(echoOut).connect(this.mix);

    this.drums = c.createGain();
    this.drums.gain.value = 0;
    this.drums.connect(this.mix);
  }

  /** Подкладывать ноты, пока вкладка на виду; спящей — не нужно: шина всё равно заглушена. */
  setAwake(on: boolean) {
    if (on && !this.timer) {
      this.timer = setInterval(this.pump, PUMP_MS);
      this.pump();
    } else if (!on && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Полёт: арпеджио вперёд и бит; краш и окно ставок — назад. */
  setFlight(on: boolean) {
    if (on === this.flying) return;
    this.flying = on;
    const t = this.c.currentTime;
    this.arpBus.gain.setTargetAtTime(on ? 0.75 : 0.3, t, on ? 0.3 : 0.4);
    this.drums.gain.setTargetAtTime(on ? 1 : 0, t, on ? 0.25 : 0.05);
    if (!on) this.arpTone.frequency.setTargetAtTime(900, t, 0.5);
  }

  /** Разгон полёта 0…1 (`driveOf`): яркость арпеджио. */
  setDrive(d: number) {
    if (!this.flying) return;
    this.arpTone.frequency.setTargetAtTime(1400 + 2600 * d, this.c.currentTime, 0.3);
  }

  /** Угасить и отпустить узлы. */
  stop() {
    this.setAwake(false);
    const t = this.c.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.12);
    setTimeout(() => this.out.disconnect(), 1200);
  }

  private readonly pump = () => {
    const c = this.c;
    if (c.state !== 'running') return;
    const now = c.currentTime;
    if (this.next < now) {
      this.step = Math.ceil(this.step / CHORD_STEPS) * CHORD_STEPS;
      this.next = now + 0.05;
    }
    while (this.next < now + LOOKAHEAD) {
      this.at(this.step, this.next);
      this.step += 1;
      this.next += STEP_S;
    }
  };

  private at(step: number, t: number) {
    if (step % CHORD_STEPS === 0) this.chord(step, t);
    this.note(arpAt(step), t, 'square', this.arpTone, 0.07, 0.22);
    const b = bassAt(step);
    if (b !== null) this.note(b, t, 'sawtooth', this.bass, 0.16, 0.26);
    if (this.flying) {
      if (step % 4 === 0) this.kick(t);
      if (step % 4 === 2) this.hat(t);
    }
  }

  /** Пэд: по две расстроенные пилы на ноту, медленная атака, хвост в следующий аккорд. */
  private chord(step: number, t: number) {
    const dur = CHORD_STEPS * STEP_S;
    for (const midi of chordAt(step).pad) {
      for (const cents of [-6, 6]) {
        const o = this.c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(midi);
        o.detune.value = cents;
        const g = this.c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.026, t + 1.4);
        g.gain.setTargetAtTime(0, t + dur, 0.5);
        o.connect(g).connect(this.pad);
        o.start(t);
        o.stop(t + dur + 2.5);
      }
    }
  }

  private note(midi: number, t: number, type: OscillatorType, out: AudioNode, peak: number, dur: number) {
    const o = this.c.createOscillator();
    o.type = type;
    o.frequency.value = hz(midi);
    const g = this.c.createGain();
    g.gain.setValueAtTime(TINY, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(TINY, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private kick(t: number) {
    const o = this.c.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = this.c.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(TINY, t + 0.3);
    o.connect(g).connect(this.drums);
    o.start(t);
    o.stop(t + 0.32);
  }

  private hat(t: number) {
    const src = this.c.createBufferSource();
    src.buffer = noiseOf(this.c).white;
    const f = this.c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.c.createGain();
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(TINY, t + 0.06);
    src.connect(f).connect(g).connect(this.drums);
    src.start(t, Math.random());
    src.stop(t + 0.07);
  }
}
