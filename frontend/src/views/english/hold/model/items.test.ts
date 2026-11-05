import { describe, expect, it } from 'vitest';
import { damageOf, startBattle } from './battle';
import { countOf, giveGear, spendItem, takeGear } from './items';
import { endDay, giveOrder, newGame, present, type HoldState } from './rules';

describe('вещи', () => {
  it('новая игра начинается с бинтом', () => {
    expect(countOf(newGame(1), 'bandage')).toBe(1);
  });

  it('бинт лечит и тратится', () => {
    let s = newGame(2);
    const p = present(s)[0];
    s = { ...s, people: s.people.map((x) => (x.id === p.id ? { ...x, hp: 2 } : x)) };
    const r = spendItem(s, 'bandage', p.id)!;
    expect(r.state.people.find((x) => x.id === p.id)!.hp).toBe(4);
    expect(countOf(r.state, 'bandage')).toBe(0);
    expect(spendItem(r.state, 'bandage', p.id)).toBeNull();
  });

  it('снаряжение носят по одной вещи, прежняя возвращается в запасы', () => {
    let s: HoldState = { ...newGame(3), items: { axe: 1, bow: 1 } };
    const p = present(s)[0];
    s = giveGear(s, 'axe', p.id)!.state;
    expect(s.people.find((x) => x.id === p.id)!.gear).toBe('axe');
    expect(countOf(s, 'axe')).toBe(0);
    s = giveGear(s, 'bow', p.id)!.state;
    expect(countOf(s, 'axe')).toBe(1);
    s = takeGear(s, p.id)!.state;
    expect(countOf(s, 'bow')).toBe(1);
    expect(s.people.find((x) => x.id === p.id)!.gear).toBeNull();
  });

  it('топор даёт больше дерева, нож — сильнее удар', () => {
    const base: HoldState = { ...newGame(4, { classic: true }), tonight: null, items: { axe: 1, knife: 1 } };
    const chop = (s: HoldState) => endDay(giveOrder(s, 'tom', { verb: 'chop', object: 'wood' }).state).res.wood;
    expect(chop(giveGear(base, 'axe', 'tom')!.state)).toBe(chop(base) + 2);
    const raid: HoldState = { ...base, tonight: { kind: 'wolves', strength: 3 } };
    const b = startBattle(raid).battle!;
    const armed = startBattle(giveGear(raid, 'knife', 'tom')!.state);
    expect(damageOf(armed, armed.battle!, 'tom', armed.battle!.enemies[0])).toBe(
      damageOf(startBattle(raid), b, 'tom', b.enemies[0]) + 1,
    );
  });

  it('обыск места почти всегда приносит вещь', () => {
    let found = 0;
    for (let seed = 1; seed <= 40; seed++) {
      let s: HoldState = { ...newGame(seed), tonight: null, items: {} };
      const pl = Object.keys(s.places!)[0] as keyof NonNullable<HoldState['places']>;
      s = { ...s, places: { ...s.places, [pl]: { ...s.places![pl]!, known: true, danger: 'none' } } };
      const p = present(s)[0];
      s = endDay(giveOrder(s, p.id, { verb: 'search', object: `the ${pl}` }).state);
      found += Object.values(s.items ?? {}).reduce((n, k) => n + (k ?? 0), 0) > 0 ? 1 : 0;
    }
    expect(found).toBeGreaterThan(20);
  });
});
