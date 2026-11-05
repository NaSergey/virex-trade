import { describe, expect, it } from 'vitest';
import { SAVES, battleOrder, fight, finishBattle, intentOf, react, reactionChoices, startBattle, type BVerb } from './battle';
import { endDay, newGame, type HoldState, type PersonId } from './rules';

const raid = (kind: 'wolves' | 'bandits', strength: number): HoldState => ({
  ...newGame(4, { classic: true }),
  tonight: { kind, strength },
});

const order = (s: HoldState, id: PersonId, verb: BVerb, label: string) => {
  const r = battleOrder(s, id, verb, label);
  expect(r.ok).toBe(true);
  return r.state;
};

describe('начало боя', () => {
  it('враги по силе набега, у каждого цель, фраза — по роли цели', () => {
    const s = startBattle(raid('wolves', 5));
    const b = s.battle!;
    expect(b.enemies.map((e) => e.name)).toEqual(['the grey wolf', 'the black wolf']);
    for (const e of b.enemies) {
      expect(e.target).not.toBeNull();
      expect(intentOf(s, e)).toMatch(/^I will bite the (hunter|builder|scout|healer)!$/);
    }
  });

  it('без набега боя нет', () => {
    const s = { ...newGame(1, { classic: true }), tonight: null };
    expect(startBattle(s)).toBe(s);
  });
});

describe('приказы в бою', () => {
  it('бессмыслица не принимается', () => {
    const s = startBattle(raid('bandits', 5));
    expect(battleOrder(s, 'tom', 'attack', 'Mira').ok).toBe(false);
    expect(battleOrder(s, 'tom', 'cover', 'the archer').ok).toBe(false);
    expect(battleOrder(s, 'tom', 'cover', 'Tom').ok).toBe(false);
    expect(battleOrder(s, 'tom', 'attack', 'the archer').ok).toBe(true);
  });

  it('удары по врагу снимают здоровье и убивают', () => {
    let s = startBattle(raid('wolves', 2));
    s = order(s, 'mira', 'attack', 'the grey wolf');
    s = order(s, 'tom', 'attack', 'the grey wolf');
    s = fight(s);
    expect(s.battle!.enemies[0].hp).toBe(0);
    // Охотница бьёт волка на 3 — одного её удара хватает, Тому достаётся воздух.
    expect(s.battle!.last).toContain('Mira killed the grey wolf!');
    expect(s.battle!.last).toContain('Tom struck at the air.');
  });

  it('закрытый щитом удар не идёт в парирование', () => {
    let s = startBattle(raid('bandits', 2));
    const aim = s.battle!.enemies[0].target!;
    const guard: PersonId = aim === 'tom' ? 'ash' : 'tom';
    s = order(s, guard, 'cover', s.people.find((p) => p.id === aim)!.name);
    s = fight(s);
    // Закрытый удар разобран сразу — парировать нечего, раунд перешёл к следующему.
    expect(s.battle!.round).toBe(2);
    expect(s.battle!.phase).toBe('orders');
    const name = s.people.find((p) => p.id === guard)!.name;
    expect(s.battle!.last.some((l) => l.startsWith(`${name} took the blow`) || l.startsWith(`${name} blocked`))).toBe(true);
  });
});

describe('парирование', () => {
  it('верная защита — мимо, неверная — урон', () => {
    let s = startBattle(raid('bandits', 2));
    s = fight(s);
    const hit = s.battle!.hits[0];
    const hp = s.people.find((p) => p.id === hit.taker)!.hp;
    const ok = react(s, 0, SAVES[hit.verb]);
    expect(ok.people.find((p) => p.id === hit.taker)!.hp).toBe(hp);
    const bad = react(s, 0, null);
    expect(bad.people.find((p) => p.id === hit.taker)!.hp).toBe(hp - hit.damage);
  });

  it('среди трёх кнопок всегда есть верная', () => {
    for (let i = 0; i < 8; i++)
      for (const verb of ['bite', 'shoot', 'smash', 'slash'] as const) {
        const c = reactionChoices({ enemy: 'e0', verb, aim: 'tom', taker: 'tom', damage: 2, covered: false, done: false }, i);
        expect(c).toHaveLength(3);
        expect(new Set(c).size).toBe(3);
        expect(c).toContain(SAVES[verb]);
      }
  });
});

describe('итог боя', () => {
  it('победа: враги мертвы, набег отбит, ночь продолжает доклад', () => {
    let s = startBattle(raid('wolves', 2));
    s = order(s, 'mira', 'attack', 'the grey wolf');
    s = order(s, 'tom', 'attack', 'the grey wolf');
    s = fight(s);
    s.battle!.hits.forEach((_, i) => (s = react(s, i, SAVES.bite)));
    expect(s.battle!.outcome).toBe('won');
    s = finishBattle(s);
    expect(s.stats.repelled).toBe(1);
    expect(s.tonight).toBeNull();
    const n = endDay(s);
    expect(n.report[0]).toMatch(/Wolves attacked the camp/);
    expect(n.report.some((l) => l.includes('camp is safe'))).toBe(true);
  });

  it('после четырёх раундов враги уходят с добычей', () => {
    let s = startBattle(raid('bandits', 10));
    for (let round = 0; round < 4 && s.battle!.phase !== 'over'; round++) {
      s = fight(s);
      s.battle!.hits.forEach((h, i) => (s = react(s, i, SAVES[h.verb])));
    }
    expect(s.battle!.outcome).toBe('fled');
    const food = s.res.food + s.res.wood + s.res.iron;
    s = finishBattle(s);
    expect(s.res.food + s.res.wood + s.res.iron).toBeLessThanOrEqual(food);
  });
});
