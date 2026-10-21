/** Случайность упражнений: перемешать задания и слова для сборки. Генератор подменяется в тестах. */
export type Rng = () => number;

/** Детерминированный генератор с зерном (mulberry32). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(list: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function sample<T>(list: readonly T[], n: number, rng: Rng = Math.random): T[] {
  return shuffle(list, rng).slice(0, n);
}

/** Слова для сборки: перемешанные и обязательно не в правильном порядке. */
export function scramble(words: readonly string[], rng: Rng = Math.random): string[] {
  const out = shuffle(words, rng);
  if (words.length > 1 && out.every((w, i) => w === words[i])) out.push(out.shift()!);
  return out;
}
