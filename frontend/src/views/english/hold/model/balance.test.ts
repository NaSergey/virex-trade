import { describe, expect, it } from 'vitest';
import { rand, next } from '../../game/model/rng';
import { SAVES, REACTIONS, battleOrder, fight, finishBattle, react, startBattle } from './battle';
import { endDay, giveOrder, newGame, present, alive, type HoldState, type Order, type PersonId, type Role } from './rules';
import { answerEvent } from './events';
import { placesOf } from './scout';
import { answerReport } from './scout';
import { answerVisitor, wiseAnswer } from './visitors';

export function play(seed: number, acc: number) {
  const r = rand(seed * 7919);
  const ok = () => next(r) < acc;
  let s: HoldState = newGame(seed);
  let scoutDir = 0;
  while (!s.outcome) {
    while (s.reports?.length) {
      const rep = s.reports[0];
      s = answerReport(s, ok() ? rep.answer : (rep.answer + 1) % rep.options.length).state;
    }
    if (s.visitor) {
      const w = wiseAnswer(s)!;
      const other = s.visitor.options.find((o) => o.id !== w)!.id;
      s = answerVisitor(s, ok() ? w : other).state;
    }
    if (s.event) {
      const opts = s.event.options;
      s = answerEvent(s, ok() ? opts[0].id : opts[opts.length - 1].id).state;
    }
    const known = placesOf(s.places).find((x) => x.p.known && !x.p.looted && x.p.danger === 'none')?.id;
    const byRole: Partial<Record<Role, Order>> = {
      hunter:
        s.res.food < 14
          ? { verb: 'go', object: 'hunting' }
          : known
            ? { verb: 'search', object: `the ${known}` as Order['object'] }
            : { verb: 'go', object: 'hunting' },
      scout:
        s.day % 5 === 2 && scoutDir < 4
          ? { verb: 'scout', object: (['the north', 'the east', 'the south', 'the west'] as const)[scoutDir++] }
          : s.res.water < 14
            ? { verb: 'fetch', object: 'water' }
            : { verb: 'go', object: 'hunting' },
      builder:
        !s.buildings.well.done && s.res.iron >= 2 && s.res.wood >= 8
          ? { verb: 'build', object: 'the well' }
          : !s.buildings.wall.done && (s.buildings.wall.started || s.res.wood >= 15)
            ? { verb: 'build', object: 'the wall' }
            : !s.buildings.wall.done
              ? { verb: 'chop', object: 'wood' }
              : { verb: 'guard', object: 'the gate' },
      healer:
        s.res.food < 10
          ? { verb: 'go', object: 'hunting' }
          : s.res.water < 8
            ? { verb: 'fetch', object: 'water' }
            : { verb: 'guard', object: 'the gate' },
    };
    const plan: Partial<Record<PersonId, Order>> = Object.fromEntries(present(s).map((p) => [p.id, byRole[p.role]]));
    for (const p of present(s)) {
      if (p.order) continue;
      const o = plan[p.id];
      if (o) s = giveOrder(s, p.id, o).state;
    }
    if (s.tonight) {
      s = startBattle(s);
      let guard = 0;
      while (s.battle && s.battle.phase !== 'over' && guard++ < 20) {
        const b = s.battle;
        const foe = b.enemies.find((e) => e.hp > 0)!;
        for (const p of present(s).filter((x) => x.hp > 0 && x.order?.verb !== 'scout')) {
          const aimed = b.enemies.find((e) => e.hp > 0 && e.target === p.id);
          const res = ok() ? battleOrder(s, p.id, 'attack', foe.name) : battleOrder(s, p.id, 'attack', s.people[0].name);
          s = res.ok ? res.state : battleOrder(res.state, p.id, 'attack', foe.name).state;
          void aimed;
        }
        s = fight(s);
        s.battle?.hits.forEach((h, i) => {
          if (!h.done) s = react(s, i, ok() ? SAVES[h.verb] : REACTIONS.find((x) => x !== SAVES[h.verb])!);
        });
      }
      s = finishBattle(s);
    }
    s = endDay(s);
  }
  return { win: s.outcome === 'win', day: s.day, alive: alive(s).length, cond: s.cond, s };
}
/**
 * Баланс всей игры ботом: лагерь, бой, разведка, гости. «Точность» — доля верных ответов
 * (фразы приказов, парирование, вопросы докладов, ответы гостям). Коридор держит кривую:
 * почти всё верно — победа почти всегда, половина — победа редко. Правка правил — прогнать.
 */
describe('баланс', () => {
  it('сложность растёт вместе с ошибками', () => {
    const N = 150;
    const rate = (acc: number) => {
      let wins = 0;
      for (let i = 1; i <= N; i++) wins += +play(i, acc).win;
      return wins / N;
    };
    const [good, mid, weak] = [rate(0.95), rate(0.8), rate(0.5)];
    expect(good).toBeGreaterThanOrEqual(0.9);
    // Со случайной зимой, характерами и событиями игра жёстче (владелец: «как This War of Mine»):
    // на 80 % верных ответов выживает примерно каждая вторая партия.
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(0.95);
    expect(weak).toBeLessThan(0.35);
  });
});
