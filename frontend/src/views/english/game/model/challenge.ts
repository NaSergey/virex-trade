import { alignScore, alignWords } from '../../model/align';
import { isCorrect, normalize } from '../../model/check';
import { shuffle, type Rand } from './rng';
import { isTypo } from './run-deck';
import type { Mode, RunCard } from './types';

/**
 * Задание удара (спека, «Удары»): что видно, что звучит и что считать верным.
 * Задание строится, когда удар выбран: до выбора видна только метка слова —
 * иначе «Узнать» показало бы ответ для «Вспомнить».
 */
export interface Challenge {
  mode: Mode;
  /** Слово (`recognize`), перевод (`recall`, `speak`, `order`) или пусто (`listen`, `dictate`). */
  prompt: string;
  /** Что звучит; у `recognize` — только после ответа (решает экран). */
  audio: string;
  /** Варианты перевода (`recognize`, `listen`). */
  options?: string[];
  /** Индекс верного варианта или эталон. */
  answer: number | string;
  /** Слова фразы вперемешку (`order`). */
  bank?: string[];
  /** Клетки длины под полем: букв в каждом слове. */
  length?: number[];
  /** Первая буква (находка «Карандаш»). */
  first?: string;
}

const OPTIONS = 4;

/** Неверные переводы — сначала из той же темы: «яблоко» среди глаголов угадывается без знания. */
function optionsFor(card: RunCard, pool: readonly RunCard[], r: Rand): { options: string[]; answer: number } {
  const right = card.ru;
  const seen = new Set([right.toLowerCase()]);
  const wrong: string[] = [];
  const others = pool.filter((c) => c.id !== card.id);
  const same = shuffle(
    r,
    others.filter((c) => c.group === card.group),
  );
  const rest = shuffle(
    r,
    others.filter((c) => c.group !== card.group),
  );
  for (const c of [...same, ...rest]) {
    if (wrong.length === OPTIONS - 1) break;
    if (seen.has(c.ru.toLowerCase())) continue;
    seen.add(c.ru.toLowerCase());
    wrong.push(c.ru);
  }
  const options = shuffle(r, [right, ...wrong]);
  return { options, answer: options.indexOf(right) };
}

const lengthOf = (en: string) =>
  en
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}']/gu, '').length)
    .filter((n) => n > 0);

/** Слова для сборки — не в правильном порядке. */
function scrambled(words: readonly string[], r: Rand): string[] {
  const out = shuffle(r, words);
  if (words.length > 1 && out.every((w, i) => w === words[i])) out.push(out.shift()!);
  return out;
}

export function makeChallenge(
  card: RunCard,
  mode: Mode,
  pool: readonly RunCard[],
  r: Rand,
  opts: { firstLetter: boolean },
): Challenge {
  switch (mode) {
    case 'recognize':
      return { mode, prompt: card.en, audio: card.en, ...optionsFor(card, pool, r) };
    case 'listen':
      return { mode, prompt: '', audio: card.en, ...optionsFor(card, pool, r) };
    case 'order': {
      const words = card.example?.[0].split(/\s+/) ?? [];
      if (words.length < 3) return makeChallenge(card, 'recall', pool, r, opts);
      return { mode, prompt: card.example![1], audio: card.example![0], answer: card.example![0], bank: scrambled(words, r) };
    }
    case 'dictate':
      return { mode, prompt: '', audio: card.en, answer: card.en, length: lengthOf(card.en) };
    case 'recall':
    case 'speak':
      return {
        mode,
        prompt: card.ru,
        audio: card.en,
        answer: card.en,
        length: lengthOf(card.en),
        ...(opts.firstLetter && mode === 'recall' ? { first: card.en.trim()[0]?.toLowerCase() } : {}),
      };
  }
}

/**
 * Ответ. Ввод: точно — верно; одна-две правки — почти, но только если
 * введённое не другое слово колоды («mouse» вместо «house» — ошибка). Голос:
 * слово — среди распознанного; фраза — не меньше 80 % слов по порядку
 * (распознавание теряет артикли).
 */
export function judge(
  ch: Challenge,
  value: string | number | number[],
  words: ReadonlySet<string> = new Set(),
): 'right' | 'typo' | 'wrong' {
  switch (ch.mode) {
    case 'recognize':
    case 'listen':
      return value === ch.answer ? 'right' : 'wrong';
    case 'order':
      if (!Array.isArray(value) || value.length === 0) return 'wrong';
      return isCorrect(value.map((i) => ch.bank![i]).join(' '), [String(ch.answer)]) ? 'right' : 'wrong';
    case 'speak':
      return typeof value === 'string' && value.trim() && alignScore(alignWords(String(ch.answer), value)) >= 0.8
        ? 'right'
        : 'wrong';
    case 'recall':
    case 'dictate': {
      if (typeof value !== 'string' || !value.trim()) return 'wrong';
      const target = String(ch.answer);
      if (isCorrect(value, [target])) return 'right';
      if (isTypo(value, target) && !words.has(normalize(value))) return 'typo';
      return 'wrong';
    }
  }
}
