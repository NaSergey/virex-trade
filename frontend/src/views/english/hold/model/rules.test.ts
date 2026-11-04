import { describe, expect, it } from 'vitest';
import {
  DAYS,
  OBJECTS,
  OBJECT_GROUPS,
  defenseOf,
  endDay,
  giveOrder,
  newGame,
  present,
  taskOf,
  upkeep,
  type HoldState,
  type Order,
  type PersonId,
} from './rules';

const order = (s: HoldState, id: PersonId, o: Order) => {
  const r = giveOrder(s, id, o);
  expect(r.ok).toBe(true);
  return r.state;
};

describe('фраза приказа', () => {
  it('верные сочетания — дела, остальное — бессмыслица', () => {
    expect(taskOf('chop', 'wood')).toEqual({ kind: 'wood' });
    expect(taskOf('build', 'the well')).toEqual({ kind: 'build', building: 'well' });
    expect(taskOf('chop', 'water')).toBeNull();
    expect(taskOf('go', 'the gate')).toBeNull();
  });

  it('бессмыслица не принимается и считается ошибкой', () => {
    const s = newGame(1);
    const r = giveOrder(s, 'tom', { verb: 'fetch', object: 'the wall' });
    expect(r.ok).toBe(false);
    expect(r.state.stats.mistakes).toBe(1);
    expect(r.state.people.find((p) => p.id === 'tom')!.order).toBeNull();
  });
});

describe('плитки приказа', () => {
  it('группы дополнений — все дополнения ровно по разу', () => {
    const flat = OBJECT_GROUPS.flatMap(([, list]) => list);
    expect([...flat].sort()).toEqual([...OBJECTS].sort());
  });
});

describe('ночь', () => {
  it('добыча, еда и вода считаются, приказы снимаются, день идёт', () => {
    let s = newGame(7);
    s = { ...s, tonight: null };
    s = order(s, 'mira', { verb: 'go', object: 'hunting' });
    s = order(s, 'ash', { verb: 'fetch', object: 'water' });
    const food = s.res.food;
    const n = endDay(s);
    expect(n.day).toBe(2);
    expect(n.people.every((p) => p.order === null)).toBe(true);
    // Охотница приносит не меньше 5, четверо съедают 8.
    expect(n.res.food).toBeGreaterThanOrEqual(food + 5 - 8);
    expect(n.report.some((l) => l.startsWith('Mira brought'))).toBe(true);
  });

  it('стройка: материалы вносятся один раз, строитель кончает колодец за день', () => {
    let s: HoldState = { ...newGame(3), tonight: null };
    s = order(s, 'tom', { verb: 'build', object: 'the well' });
    const n = endDay(s);
    expect(n.buildings.well.done).toBe(true);
    expect(n.res.wood).toBe(10 - 8);
    expect(upkeep(n).water).toBe(2 * present(n).length - 4);
  });

  it('без материалов стройка не начинается', () => {
    let s: HoldState = { ...newGame(3), tonight: null };
    s = order(s, 'tom', { verb: 'build', object: 'the wall' });
    const n = endDay(s);
    expect(n.buildings.wall.started).toBe(false);
    expect(n.report.some((l) => l.includes('no materials'))).toBe(true);
  });

  it('стража отбивает набег слабее защиты', () => {
    let s: HoldState = { ...newGame(5), tonight: { kind: 'wolves', strength: 4 } };
    s = order(s, 'tom', { verb: 'guard', object: 'the gate' });
    s = order(s, 'ash', { verb: 'guard', object: 'the gate' });
    expect(defenseOf(s)).toBe(4);
    const n = endDay(s);
    expect(n.stats.repelled).toBe(1);
    expect(n.report.some((l) => l.includes('drove them away'))).toBe(true);
  });

  it('прорыв ранит и уносит запасы', () => {
    const s: HoldState = { ...newGame(5), tonight: { kind: 'bandits', strength: 6 } };
    const n = endDay(s);
    expect(n.stats.repelled).toBe(0);
    expect(n.report.some((l) => l.includes('broke into the camp'))).toBe(true);
  });

  it('голод без еды — люди слабеют и в конце уходят или гибнут', () => {
    let s: HoldState = { ...newGame(9), res: { food: 0, water: 0, wood: 0, iron: 0 } };
    for (let i = 0; i < 12 && !s.outcome; i++) s = endDay({ ...s, tonight: null, res: { food: 0, water: 0, wood: 0, iron: 0 } });
    expect(s.outcome).toBe('lose');
  });

  it('продержаться тридцать дней — победа', () => {
    let s = newGame(11);
    // Простой бот: охота, вода, стража, остальные — дрова или колодец.
    for (let d = 0; d < DAYS && !s.outcome; d++) {
      const plan: [PersonId, Order][] = [
        ['mira', { verb: 'go', object: 'hunting' }],
        ['ash', { verb: 'fetch', object: 'water' }],
        [
          'tom',
          s.buildings.well.done || s.res.iron < 2 ? { verb: 'guard', object: 'the gate' } : { verb: 'build', object: 'the well' },
        ],
        ['ezra', { verb: 'go', object: 'hunting' }],
      ];
      for (const [id, o] of plan) {
        const r = giveOrder(s, id, o);
        s = r.state;
      }
      s = endDay(s);
    }
    expect(s.outcome).not.toBeNull();
    expect(s.day).toBeGreaterThan(5);
  });

  it('один и тот же сид — одна и та же игра', () => {
    expect(endDay(newGame(42))).toEqual(endDay(newGame(42)));
  });
});
