/**
 * Сравнение ответа с эталоном. Ученик пишет «I am», книга — «I'm»: оба верны,
 * поэтому сокращения раскрываются у обеих сторон одинаково. `'s` раскрывается
 * только после местоимений и вопросительных слов: у имени это притяжательный
 * («Tom's bag»), и «Tom is bag» верным стать не должен.
 */
const PRONOUN_S = /\b(he|she|it|what|where|who|that|there|here|how)'s\b/g;

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\b([a-z]+)'s got\b/g, '$1 has got')
    .replace(PRONOUN_S, '$1 is')
    .replace(/\bcan't\b/g, 'cannot')
    .replace(/\bcan not\b/g, 'cannot')
    .replace(/\bwon't\b/g, 'will not')
    .replace(/n't\b/g, ' not')
    .replace(/\bi'm\b/g, 'i am')
    .replace(/'re\b/g, ' are')
    .replace(/'ve\b/g, ' have')
    .replace(/'ll\b/g, ' will')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isCorrect(input: string, answers: readonly string[]): boolean {
  const given = normalize(input);
  return given !== '' && answers.some((a) => normalize(a) === given);
}

/** Пропуск `___`, заполненный ответом; `'m`, `'s` прилипают к слову слева, как в «I'm». */
export function fillGap(q: string, value: string): string {
  const v = value.trim();
  return /^['’]/.test(v) ? q.replace(/\s*___/, v) : q.replace('___', v);
}

/**
 * Ответ на пропуск сверяется фразой целиком: «'m» в пропуске после «I» — это
 * «I'm», а отдельно от «I» сокращение не раскрыть.
 */
export function isGapCorrect(q: string, input: string, answers: readonly string[]): boolean {
  if (!input.trim()) return false;
  return isCorrect(
    fillGap(q, input),
    answers.map((a) => fillGap(q, a)),
  );
}
