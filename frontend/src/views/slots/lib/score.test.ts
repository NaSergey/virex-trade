import { describe, expect, it } from 'vitest';
import { PENTA, SCALE, SCORE, STEPS, hits, penta, type MusicMode } from './score';

const inScale = (midi: number) => SCALE.includes(((midi % 12) + 12) % 12);
const modes = Object.keys(SCORE) as MusicMode[];

describe('партитура слотов', () => {
  it('мелодия каждого режима — в ля миноре', () => {
    for (const m of modes) {
      const s = SCORE[m];
      expect(s.lead).toHaveLength(STEPS * 4);
      for (const [i, n] of s.lead.entries()) {
        if (n === null) continue;
        // Над E7 сокровищницы — вводный соль-диез, гармонический минор.
        const leading = m === 'pick' && i >= STEPS * 3 && n % 12 === 8;
        if (!leading) expect(inScale(n), `${m}: ${n}`).toBe(true);
      }
      expect(s.bass).toHaveLength(STEPS);
      expect(s.chords).toHaveLength(4);
    }
  });

  it('аккорды — в тональности; единственный выход — E7 сокровищницы (гармонический минор)', () => {
    for (const m of modes)
      for (const [k, ch] of SCORE[m].chords.entries())
        for (const n of ch)
          if (!(m === 'pick' && k === 3 && n % 12 === 8)) expect(inScale(n), `${m} аккорд ${k}: ${n}`).toBe(true);
  });

  it('ритмы — по 16 шагов', () => {
    for (const m of modes) for (const p of [SCORE[m].kick, SCORE[m].snare, SCORE[m].hat]) expect(p).toHaveLength(16);
    expect(hits('x...x...')).toEqual([0, 4]);
  });

  it('пентатоника эффектов идёт вверх по C D E G A', () => {
    expect([0, 1, 2, 3, 4, 5].map((d) => penta(d))).toEqual([72, 74, 76, 79, 81, 84]);
    for (let d = 0; d < 20; d++) expect(PENTA).toContain(penta(d) % 12);
  });
});
