import { describe, expect, it } from 'vitest';
import { COURSE, EXERCISES } from '../../content';
import { normalize } from '../../model/check';
import { openUnits } from '../../model/course';
import { combos } from '../model/scene';
import { BOSSES, blockOf } from './bosses';
import { CHARACTERS } from './characters';
import { ELITES, ENEMIES, bossStats, eliteStats, enemyStats } from './enemies';
import { QUESTS } from './quests';
import { ITEMS, RELICS } from './relics';
import { SCENES } from './scenes';
import { isReply } from './scenes/types';
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
    expect(enemyStats(5, 0)).toEqual({ hp: 45, atk: 6, every: 3 });
    expect(enemyStats(1, 0)).toEqual({ hp: 33, atk: 4, every: 3 });
    expect(enemyStats(9, 0)).toEqual({ hp: 57, atk: 8, every: 3 });
    expect(enemyStats(5, 1).hp).toBe(Math.round(45 * 1.15));
    expect(eliteStats(5, 0)).toEqual({ hp: 59, atk: 8, every: 3 });
    expect(bossStats(0)).toEqual({ hp: 80, atk: 9, every: 3 });
    expect(bossStats(6).hp).toBe(100);
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

const BLOCK_UNITS = ['sp', 'u04', 'u07', 'u10', 'u13', 'u16', 'u19', 'u22'];

describe('сцены', () => {
  it('24 сцены, по три на блок, id уникальны, с начала открыты три', () => {
    expect(SCENES).toHaveLength(24);
    expect(new Set(SCENES.map((s) => s.id)).size).toBe(24);
    for (const unit of BLOCK_UNITS) expect(SCENES.filter((s) => s.unit === unit)).toHaveLength(3);
    const open = openUnits(COURSE, new Set());
    expect(SCENES.filter((s) => open.has(s.unit))).toHaveLength(3);
  });

  for (const scene of SCENES) {
    it(`${scene.id}: шаги, варианты, переменные`, () => {
      expect(scene.title && scene.goal && scene.place.en && scene.place.ru && scene.npc.name).toBeTruthy();
      expect('npc' in scene.steps[0]).toBe(true);
      const replies = scene.steps.filter(isReply);
      expect(replies.length).toBeGreaterThanOrEqual(5);
      expect(replies.length).toBeLessThanOrEqual(6);
      expect(scene.phrases.length).toBeGreaterThanOrEqual(2);
      expect(scene.phrases.length).toBeLessThanOrEqual(3);
      for (const values of Object.values(scene.vars ?? {})) {
        expect(values.length).toBeGreaterThanOrEqual(3);
        expect(values.length).toBeLessThanOrEqual(6);
      }
      const texts: string[] = [];
      for (const step of scene.steps) {
        if (!isReply(step)) {
          expect(step.npc.trim() && step.ru.trim()).toBeTruthy();
          texts.push(step.npc);
          continue;
        }
        const ok = step.reply.filter((o) => o.ok);
        expect(ok).toHaveLength(1);
        expect(normalize(ok[0].en)).not.toBe('');
        expect(new Set(step.reply.map((o) => o.en)).size).toBe(step.reply.length);
        const wrong = step.reply.filter((o) => !o.ok);
        if (ok[0].distract) {
          expect(scene.vars?.[ok[0].distract]?.length).toBeGreaterThanOrEqual(3);
          expect(ok[0].why && ok[0].react).toBeTruthy();
        } else {
          expect(wrong.length).toBe(2);
        }
        for (const o of wrong) expect(o.why && o.react && o.ru).toBeTruthy();
        texts.push(...step.reply.flatMap((o) => [o.en, o.react ?? '']), ...(step.accept ?? []));
      }
      for (const t of texts) expect(combos(scene, t).length).toBeLessThanOrEqual(12);
    });
  }
});
