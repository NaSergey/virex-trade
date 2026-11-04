import type { SoundName } from './model/types';

/**
 * Звуки игры — синтез на Web Audio (спека, «Вид и звук»): записей нет, ноты
 * короткие и тихие, смысл — в направлении мелодии (вверх — хорошо, вниз —
 * плохо). Слова и реплики звучат своими записями (`model/speech.ts`).
 */
const KEY = 'virex.english.game.sound';

let ctx: AudioContext | null = null;

export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // Хранилище закрыто — выбор живёт до перезагрузки.
  }
}

type Note = [freq: number, start: number, dur: number, wave?: OscillatorType, gain?: number];

const NOTES: Record<SoundName, Note[]> = {
  hit: [
    [520, 0, 0.07, 'triangle'],
    [780, 0.05, 0.09, 'triangle'],
  ],
  crit: [
    [660, 0, 0.07],
    [880, 0.06, 0.07],
    [1320, 0.12, 0.14],
  ],
  wrong: [
    [220, 0, 0.16, 'square', 0.05],
    [165, 0.1, 0.2, 'square', 0.045],
  ],
  hurt: [[140, 0, 0.16, 'sawtooth', 0.06]],
  heal: [
    [523, 0, 0.12],
    [659, 0.08, 0.16],
  ],
  coin: [
    [988, 0, 0.05, 'square', 0.04],
    [1319, 0.05, 0.09, 'square', 0.04],
  ],
  win: [
    [523, 0, 0.1],
    [659, 0.09, 0.1],
    [784, 0.18, 0.1],
    [1047, 0.27, 0.22],
  ],
  lose: [
    [392, 0, 0.14],
    [330, 0.13, 0.14],
    [262, 0.26, 0.14],
    [196, 0.39, 0.3],
  ],
  step: [[300, 0, 0.05, 'triangle', 0.05]],
};

export function playSound(name: SoundName): void {
  if (typeof window === 'undefined' || !soundOn()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    for (const [freq, start, dur, wave = 'sine', gain = 0.12] of NOTES[name]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + start);
      g.gain.exponentialRampToValueAtTime(gain, t0 + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.02);
    }
  } catch {
    // Браузер без Web Audio — игра идёт молча.
  }
}
