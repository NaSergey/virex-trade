/**
 * Звук джетпака чистыми функциями: какие события слышны между соседними
 * снимками, чем гудит двигатель и что играет музыка на каждом шаге. Сам звук — `synth.ts` и `music.ts`, проводка —
 * `model/useJetpackSound.ts`.
 */
import type { JetpackView } from '@/entities/jetpack';

export type JetpackSound =
  | 'launch' // раунд взлетел: зажигание
  | 'crash' // ракета взорвалась
  | 'bet' // моя ставка принята
  | 'cashout'; // мой вывод прошёл (руками или автовыводом)

type Snap = Pick<JetpackView, 'phase' | 'roundId' | 'me'>;

/**
 * События между соседними снимками. Сервер шлёт состояние, а не события
 * (как у столов), поэтому слышно только то, что сменилось на глазах: открывший
 * страницу посреди полёта не слышит зажигания, а после краша — взрыва.
 */
export function soundEvents(prev: Snap | null, next: Snap): JetpackSound[] {
  if (!prev) return [];
  const out: JetpackSound[] = [];
  const same = prev.roundId === next.roundId;
  if (next.me && !(same && prev.me)) out.push('bet');
  if (same && prev.me?.cashoutX100 == null && next.me?.cashoutX100 != null) out.push('cashout');
  if (next.phase === 'flying' && prev.phase !== 'flying') out.push('launch');
  if (next.phase === 'crashed' && prev.phase === 'flying') out.push('crash');
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Голос двигателя от тяги (`thrustAt`) и множителя. Громкость — за тягой:
 * факел зажигания гудит тихо, полная тяга — в полную силу. Высота — за
 * множителем, по октавам (`log2`): рост на экране экспоненциальный, и тон,
 * привязанный к самому множителю, за десяток секунд ушёл бы в писк.
 */
export function engineTone(thrust: number, m: number) {
  const oct = Math.log2(Math.max(1, m));
  return {
    level: 0.3 * thrust,
    /** Срез шума: рёв светлеет с тягой и высотой. */
    cutoff: clamp(220 + 700 * thrust + 180 * oct, 100, 2400),
    /** Низ корпуса — пила под фильтром. */
    sub: clamp(38 + 10 * thrust + 6 * oct, 30, 90),
    /** Тонкий свист поверх рёва — главное, что «растёт» на слух. */
    whine: clamp(160 * 2 ** (0.55 * oct), 120, 1400),
  };
}

/** Частота ноты MIDI. */
export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Темп музыки и её шаг — шестнадцатая. */
export const BPM = 92;
export const STEP_S = 60 / BPM / 4;
/** Аккорд держится два такта. */
export const CHORD_STEPS = 32;

/**
 * Синтвейв в ля миноре: Am – F – C – G, по два такта. Аккорды — близким
 * голосоведением (C и G взяты обращениями), чтобы пэд не прыгал по октавам.
 */
const CHORDS = [
  { pad: [57, 60, 64], bass: 45 }, // Am: A3 C4 E4
  { pad: [57, 60, 65], bass: 41 }, // F: A3 C4 F4
  { pad: [55, 60, 64], bass: 48 }, // C: G3 C4 E4
  { pad: [55, 59, 62], bass: 43 }, // G: G3 B3 D4
] as const;

export const chordAt = (step: number) => CHORDS[Math.floor(step / CHORD_STEPS) % CHORDS.length];

/** Узор арпеджио на восемь шестнадцатых: индексы в [тоны аккорда октавой выше, корень двумя]. */
const ARP = [0, 1, 2, 3, 2, 1, 2, 1] as const;

/** Нота арпеджио на шаге. */
export function arpAt(step: number) {
  const { pad } = chordAt(step);
  const i = ARP[step % ARP.length];
  return i === 3 ? pad[0] + 24 : pad[i] + 12;
}

/** Бас восьмыми: на долю — корень, между долями — октава выше. */
export function bassAt(step: number): number | null {
  if (step % 2) return null;
  const root = chordAt(step).bass;
  return step % 4 === 2 ? root + 12 : root;
}

/**
 * Насколько «разогнана» музыка в полёте: 0 на старте, 1 — к 16x. Открывает
 * фильтр арпеджио — чем выше ракета, тем ярче.
 */
export const driveOf = (m: number) => clamp(Math.log2(Math.max(1, m)) / 4, 0, 1);
