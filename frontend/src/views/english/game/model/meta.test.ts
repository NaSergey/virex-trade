import { describe, expect, it } from 'vitest';
import type { RunRow } from '../../api/hooks';
import { shiftDay } from '../../model/activity';
import { QUESTS } from '../content/quests';
import {
  availableCharacters,
  availableRelics,
  gameStreak,
  goldDays,
  maxFog,
  questProgress,
  questsOf,
  records,
  unlocked,
  weatherOf,
} from './meta';
import { emptyStats, type RunStats } from './types';

const at = (day: string, h = 12) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).toISOString();

function row(day: string, p: Partial<Omit<RunRow, 'stats'>> = {}, stats: Partial<RunStats> = {}): RunRow {
  return {
    id: `r${day}${p.fog ?? 0}${p.outcome ?? 'dead'}${Math.random()}`,
    startedAt: at(day),
    finishedAt: at(day),
    character: 'tourist',
    fog: 0,
    outcome: 'dead',
    depth: 4,
    score: 100,
    ...p,
    stats: { ...emptyStats(), ...stats },
  };
}

const voice = (n: number): Partial<RunStats> => {
  const s = emptyStats();
  s.modes.speak.right = n;
  return { modes: s.modes };
};

describe('открытия', () => {
  it('без забегов — только стартовое; уровень тумана 0', () => {
    expect(availableCharacters([], true)).toEqual(['tourist']);
    expect(availableRelics([], true)).toHaveLength(8);
    expect(maxFog([])).toBe(0);
    expect(unlocked([]).size).toBe(0);
  });

  it('победа на тумане N открывает N+1', () => {
    expect(maxFog([row('2026-11-01', { outcome: 'win', fog: 0 })])).toBe(1);
    expect(
      maxFog([row('2026-11-01', { outcome: 'win', fog: 0 }), row('2026-11-02', { outcome: 'win', fog: 1 })]),
    ).toBe(2);
    expect(maxFog([row('2026-11-02', { outcome: 'win', fog: 1 })])).toBe(0);
  });

  it('голос: 20 слов — Мегафон, 30 — Диктор; без распознавания их нет', () => {
    const runs = [row('2026-11-01', {}, voice(25))];
    expect(availableRelics(runs, true)).toContain('megaphone');
    expect(availableCharacters(runs, true)).not.toContain('announcer');
    const more = [...runs, row('2026-11-02', {}, voice(10))];
    expect(availableCharacters(more, true)).toContain('announcer');
    expect(availableCharacters(more, false)).not.toContain('announcer');
    expect(availableRelics(more, false)).not.toContain('megaphone');
  });

  it('победа над хранителем открывает Студента и Шарф', () => {
    const runs = [row('2026-11-01', { outcome: 'win' }, { boss: { right: 5, wrong: 1, reached: true, beaten: true } })];
    expect(availableCharacters(runs, true)).toContain('student');
    expect(availableRelics(runs, true)).toEqual(expect.arrayContaining(['scarf', 'bus']));
  });
});

describe('погода и задания дня', () => {
  it('погода по дате устойчива и не повторяет вчерашнюю', () => {
    let day = '2026-11-01';
    for (let i = 0; i < 60; i++) {
      const next = shiftDay(day, -1);
      expect(weatherOf(next)).not.toBe(weatherOf(day));
      expect(weatherOf(next)).toBe(weatherOf(next));
      day = next;
    }
  });

  it('три задания из разных групп; без речи нет «скажи», без новых слов нет «познакомься»', () => {
    for (let i = 0; i < 40; i++) {
      const day = shiftDay('2026-12-31', i);
      const qs = questsOf(day, [], true, true);
      expect(qs.map((q) => q.group).sort()).toEqual(['learn', 'play', 'scene']);
      const without = questsOf(day, [], false, false);
      expect(without.some((q) => q.id === 'speak10' || q.id === 'new5')).toBe(false);
    }
  });

  it('прогресс задания складывает забеги дня', () => {
    const recall = QUESTS.find((q) => q.id === 'recall15')!;
    const a = emptyStats();
    a.modes.recall.right = 9;
    const b = emptyStats();
    b.modes.recall.right = 8;
    expect(questProgress(recall, [a, b])).toBe(17);
    const combo = QUESTS.find((q) => q.id === 'combo10')!;
    expect(questProgress(combo, [{ ...a, maxCombo: 4 }, { ...b, maxCombo: 7 }])).toBe(7);
  });
});

describe('серия и рекорды', () => {
  it('серия игры: сегодня не играл — до вчера; пропуск рвёт', () => {
    const runs = [row('2026-11-03'), row('2026-11-02'), row('2026-10-30')];
    expect(gameStreak(runs, '2026-11-04')).toBe(2);
    expect(gameStreak([...runs, row('2026-11-04')], '2026-11-04')).toBe(3);
  });

  it('золотой день — все три задания; сыгранный — хоть один забег', () => {
    const runs = [
      row('2026-11-03', {}, { quests: ['recall15', 'combo10'] }),
      row('2026-11-03', {}, { quests: ['recall15', 'combo10', 'scenes2'] }),
      row('2026-11-02'),
    ];
    const strip = goldDays(runs, '2026-11-04', 4);
    expect(strip).toEqual(['none', 'played', 'gold', 'none']);
  });

  it('рекорды: лучшие очки по туману, станция, победы, серия', () => {
    const r = records([
      row('2026-11-01', { score: 300, depth: 6 }, { maxCombo: 9, recalled: 4 }),
      row('2026-11-02', { score: 500, depth: 10, outcome: 'win' }, { maxCombo: 5, recalled: 6 }),
      row('2026-11-03', { score: 200, fog: 1, depth: 3 }),
    ]);
    expect(r.best.get(0)).toBe(500);
    expect(r.best.get(1)).toBe(200);
    expect(r).toMatchObject({ depth: 10, wins: 1, combo: 9, runs: 3, recalled: 10 });
  });
});
