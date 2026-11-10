/**
 * Партитура музыки слотов — данные без Web Audio, чтобы их можно было
 * проверить тестом. Всё в одной тональности: ля минор / до мажор. Эффекты
 * автомата (`sound.ts`) звучат нотами той же гаммы, поэтому выигрыш поверх
 * музыки ложится в неё, а не спорит с ней.
 *
 * Такт — 16 шагов по шестнадцатой, на аккорд — один такт, цикл — четыре.
 */

export type MusicMode = 'base' | 'free' | 'pick' | 'wheel';

export const STEPS = 16;

/** MIDI → герцы. */
export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Ноты ля минора (они же до мажора) — по ним сверяется партитура. */
export const SCALE = [0, 2, 4, 5, 7, 9, 11]; // от C
/** Пентатоника до мажора: C D E G A — у колокольчиков эффектов нет фальшивых нот. */
export const PENTA = [0, 2, 4, 7, 9];

/** Нота пентатоники по номеру ступени от C5 (72): 0 → C5, 5 → C6. */
export const penta = (degree: number, base = 72) =>
  base + 12 * Math.floor(degree / PENTA.length) + PENTA[((degree % PENTA.length) + PENTA.length) % PENTA.length];

export interface Section {
  bpm: number;
  /** Аккорд на такт: ноты пэда/пиано (MIDI). Бас берёт первую ноту октавой ниже. */
  chords: number[][];
  /** Бас: на каком шаге такта звучит и на сколько полутонов от корня (null — пауза). */
  bass: (number | null)[];
  /** Мелодия на цикл (4 такта × 16): MIDI или null. */
  lead: (number | null)[];
  kick: string;
  /** Малый барабан; у трэпа — клэп. */
  snare: string;
  /** Хэты: `x` — удар, `r` — ролл (дробь из трёх ударов в шаг), как в трэпе. */
  hat: string;
  /** Бас — 808: длинный синус с подъездом тона, а не короткая нота. */
  bass808?: boolean;
  /** Чем звучат аккорды: электропиано, пэд, стабы меди. */
  keys: 'epiano' | 'pad' | 'stab';
  /** Чем звучит мелодия. */
  voice: 'pluck' | 'mallet' | 'bell';
  /** Ритм аккордов: шаги такта, где они берутся (пэд держит такт целиком). */
  comp: number[];
}

const R = null;

/** Строка «x...» → набор шагов (`r` — тоже удар, с дробью). */
export const hits = (pattern: string) =>
  pattern.split('').flatMap((ch, i) => (ch === 'x' || ch === 'r' ? [i] : []));

/** Шаги с роллом хэтов. */
export const rolls = (pattern: string) => pattern.split('').flatMap((ch, i) => (ch === 'r' ? [i] : []));

// Аккорды: Am9, Fmaj7, Cmaj7, G6 — мягкий лаунж без резких функций.
const AM9 = [57, 60, 64, 67, 71];
const FMAJ7 = [53, 57, 60, 64];
const CMAJ7 = [48, 55, 59, 64];
const G6 = [55, 59, 62, 64];

const seq = (notes: [number, number][], len = STEPS * 4) => {
  const out: (number | null)[] = Array(len).fill(R);
  for (const [step, midi] of notes) out[step] = midi;
  return out;
};

export const SCORE: Record<MusicMode, Section> = {
  // Обычная игра — крипто-трэп (владелец 2026-11-10: «больше в крипто уклон, а не в космос»):
  // 808, хэты с роллами, клэп на третьей доле, тёмный плак. Лаунж и пэд-космос сняты.
  base: {
    bpm: 140,
    chords: [
      [57, 60, 64],
      [53, 57, 60],
      [48, 52, 55],
      [55, 59, 62],
    ],
    bass: [0, R, R, R, R, R, R, R, R, R, 0, R, R, R, 7, R],
    lead: seq([
      [0, 76], [3, 72], [6, 74], [10, 69],
      [16, 77], [19, 72], [22, 74], [26, 69],
      [32, 76], [35, 72], [38, 79], [42, 76],
      [48, 74], [51, 71], [54, 74], [58, 79],
    ]),
    kick: 'x.........x.....',
    snare: '........x.......',
    hat: 'x.x.x.x.x.x.xrxr',
    keys: 'pad',
    voice: 'pluck',
    comp: [0],
    bass808: true,
  },
  // Бесплатные спины — тот же трэп злее и быстрее: арпеджио шестнадцатыми, хэты дробью, бас чаще.
  free: {
    bpm: 150,
    chords: [AM9, FMAJ7, CMAJ7, G6],
    bass: [0, R, R, 0, R, R, R, R, R, R, 0, R, R, 12, R, R],
    lead: Array.from({ length: STEPS * 4 }, (_, i) => {
      const bar = [AM9, FMAJ7, CMAJ7, G6][Math.floor(i / STEPS)];
      if (i % 2) return R;
      const tones = bar.slice(1).map((n) => n + 12);
      return tones[(i / 2) % tones.length];
    }),
    kick: 'x.....x...x.....',
    snare: '....x.......x...',
    hat: 'xrxrxrxrxrxrxrrr',
    keys: 'pad',
    voice: 'pluck',
    comp: [0],
    bass808: true,
  },
  // Сокровищница — тайна: маримба, низкий гул, редкие удары; гармонический минор (E7).
  pick: {
    bpm: 92,
    chords: [
      [57, 60, 64],
      [55, 59, 62],
      [53, 57, 60],
      [52, 56, 59, 62],
    ],
    bass: [0, R, R, R, R, R, R, R, 0, R, R, R, R, R, R, R],
    lead: seq([
      [0, 81], [3, 79], [6, 76], [10, 72],
      [16, 79], [19, 76], [22, 74], [26, 71],
      [32, 77], [35, 76], [38, 72], [42, 69],
      [48, 76], [51, 74], [54, 71], [58, 68], [62, 71],
    ]),
    kick: 'x.........x.....',
    snare: '........x.......',
    hat: '..x...x...x.x.r.',
    keys: 'pad',
    voice: 'mallet',
    comp: [0],
    bass808: true,
  },
  // Колесо фортуны — телешоу: мажор, стабы меди, бодрый бит.
  wheel: {
    bpm: 128,
    chords: [
      [60, 64, 67, 72],
      [57, 60, 64, 69],
      [53, 57, 60, 65],
      [55, 59, 62, 67],
    ],
    bass: [0, R, R, 12, R, R, 0, R, R, R, 7, R, 12, R, R, R],
    lead: seq([
      [0, 84], [2, 79], [4, 76], [6, 79], [8, 84], [12, 88],
      [16, 81], [18, 76], [20, 72], [22, 76], [24, 81], [28, 84],
      [32, 77], [34, 81], [36, 84], [40, 89],
      [48, 86], [50, 83], [52, 79], [56, 83], [58, 86], [60, 91],
    ]),
    kick: 'x...x...x...x...',
    snare: '....x.......x..x',
    hat: 'x.xrx.x.x.xrx.xr',
    keys: 'stab',
    voice: 'bell',
    comp: [0, 3, 6, 10],
  },
};

/** Длина шага в секундах. */
export const stepSeconds = (mode: MusicMode) => 60 / SCORE[mode].bpm / 4;
