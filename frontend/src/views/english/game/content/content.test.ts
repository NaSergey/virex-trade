import { describe, expect, it } from 'vitest';
import { COURSE, EXERCISES } from '../../content';
import { BOSSES, blockOf } from './bosses';
import { CHARACTERS } from './characters';
import { ELITES, ENEMIES, bossStats, eliteStats, enemyStats } from './enemies';
import { QUESTS } from './quests';
import { ITEMS, RELICS } from './relics';
import { WEATHER } from './weather';

describe('данные игры', () => {
  it('противники стоят в рядах 1–9, у каждого ряда есть кто-то без речи', () => {
    for (const e of ENEMIES) {
      expect(e.rows[0]).toBeGreaterThanOrEqual(1);
      expect(e.rows[1]).toBeLessThanOrEqual(9);
      expect(e.rows[0]).toBeLessThanOrEqual(e.rows[1]);
    }
    for (let row = 1; row <= 9; row++) {
      expect(ENEMIES.some((e) => !e.speech && e.rows[0] <= row && row <= e.rows[1])).toBe(true);
    }
    expect(ELITES).toHaveLength(3);
  });

  it('числа противников — из спеки, туман прибавляет здоровья', () => {
    expect(enemyStats(5, 0)).toEqual({ hp: 22, atk: 4, every: 4 });
    expect(enemyStats(1, 0)).toEqual({ hp: 14, atk: 3, every: 4 });
    expect(enemyStats(9, 0)).toEqual({ hp: 30, atk: 5, every: 4 });
    expect(enemyStats(5, 1).hp).toBe(Math.round(22 * 1.15));
    expect(eliteStats(5, 0)).toEqual({ hp: 42, atk: 6, every: 3 });
    expect(bossStats(0)).toEqual({ hp: 54, atk: 7, every: 3 });
    expect(bossStats(6).hp).toBe(Math.round(54 * 1.25));
  });

  it('восемь хранителей, каждый раздел с упражнениями — в блоке', () => {
    expect(BOSSES.map((b) => b.block)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(blockOf('sp')).toBe(1);
    expect(blockOf('u04')).toBe(2);
    expect(blockOf('r3')).toBe(3);
    expect(blockOf('play')).toBe(8);
    for (const s of COURSE) expect(blockOf(s.id)).toBeGreaterThanOrEqual(1);
    for (const e of EXERCISES) expect(blockOf(e.unit)).toBeGreaterThanOrEqual(1);
  });

  it('16 находок, 8 открыты с начала; персонажи стартуют с существующей находкой', () => {
    const relics = Object.values(RELICS);
    expect(relics).toHaveLength(16);
    expect(relics.filter((r) => r.unlock === null)).toHaveLength(8);
    for (const c of Object.values(CHARACTERS)) expect(RELICS[c.relic]).toBeDefined();
    expect(Object.values(CHARACTERS).filter((c) => c.unlock === null)).toHaveLength(1);
    expect(Object.keys(ITEMS)).toHaveLength(5);
  });

  it('семь погод, задания — по три и больше в группе', () => {
    expect(Object.keys(WEATHER)).toHaveLength(7);
    for (const g of ['learn', 'play', 'scene'] as const) {
      expect(QUESTS.filter((q) => q.group === g).length).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
  });
});
