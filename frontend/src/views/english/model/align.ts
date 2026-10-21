import { normalize } from './check';

/**
 * Разметка диктанта и произношения по словам: какие слова эталона услышаны
 * (`ok`), какие пропущены (`missing`), что лишнее (`extra`). Выравнивание — по
 * наибольшей общей подпоследовательности, поэтому одно пропущенное слово не
 * делает неверными все следующие.
 */
export interface WordMark {
  word: string;
  kind: 'ok' | 'missing' | 'extra';
}

interface Token {
  word: string;
  key: string;
}

const NUMBERS = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');

/** «12» и «twelve» — одно слово: распознавание речи отдаёт числа цифрами. */
const numberKey = (piece: string) => (/^\d+$/.test(piece) && Number(piece) <= 20 ? NUMBERS[Number(piece)] : piece);

/**
 * Слова фразы. Сокращение раскрывается (`normalize`): «I'm» и «I am» — одно и
 * то же, а распознавание речи часто отдаёт полную форму. Раскрытое слово
 * показывается полной формой.
 */
const tokenize = (text: string): Token[] =>
  text.split(/\s+/).flatMap((raw) => {
    const word = raw.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');
    const pieces = normalize(raw).split(' ').filter(Boolean).map(numberKey);
    if (pieces.length <= 1) return pieces.map((key) => ({ word, key }));
    return pieces.map((key) => ({ word: key === 'i' ? 'I' : key, key }));
  });

export function alignWords(expected: string, actual: string): WordMark[] {
  const a = tokenize(expected);
  const b = tokenize(actual);
  // lcs[i][j] — длина общей подпоследовательности суффиксов a[i..] и b[j..].
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i].key === b[j].key ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const marks: WordMark[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i].key === b[j].key) {
      marks.push({ word: a[i].word, kind: 'ok' });
      i += 1;
      j += 1;
    } else if (j >= b.length || (i < a.length && lcs[i + 1][j] >= lcs[i][j + 1])) {
      marks.push({ word: a[i].word, kind: 'missing' });
      i += 1;
    } else {
      marks.push({ word: b[j].word, kind: 'extra' });
      j += 1;
    }
  }
  return marks;
}

/** Доля слов эталона, которые совпали. */
export function alignScore(marks: readonly WordMark[]): number {
  const ok = marks.filter((m) => m.kind === 'ok').length;
  const total = ok + marks.filter((m) => m.kind === 'missing').length;
  return total === 0 ? 0 : ok / total;
}
