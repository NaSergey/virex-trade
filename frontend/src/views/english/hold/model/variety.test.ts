import { describe, expect, it } from 'vitest';
import { answerEvent, makeEvent } from './events';
import { endDay, giveOrder, newGame, present, upkeep, wrongOrder, type HoldState } from './rules';
import { placesOf } from './scout';

describe('каждая партия своя', () => {
  it('карта, отряд и зима меняются от партии к партии', () => {
    const games = Array.from({ length: 40 }, (_, i) => newGame(i + 1));
    const maps = new Set(
      games.map((g) =>
        placesOf(g.places)
          .map((x) => x.id)
          .join(','),
      ),
    );
    const crews = new Set(games.map((g) => g.people.map((p) => p.name).join(',')));
    const conds = new Set(games.map((g) => g.cond));
    expect(maps.size).toBeGreaterThan(30);
    expect(crews.size).toBeGreaterThan(30);
    expect(conds.size).toBe(5);
    for (const g of games) {
      expect(placesOf(g.places).map((x) => x.dir)).toEqual(['north', 'east', 'south', 'west']);
      expect(new Set(g.people.map((p) => p.role)).size).toBe(4);
      expect(g.people.every((p) => p.trait && p.face)).toBe(true);
    }
  });

  it('обыскать место, которого на этой карте нет, нельзя — и игра говорит почему', () => {
    const g = newGame(3);
    const ids = placesOf(g.places).map((x) => x.id);
    const missing = (['mill', 'ruins', 'farm', 'cave', 'swamp', 'church', 'mine', 'village', 'bridge', 'lake'] as const).find(
      (id) => !ids.includes(id),
    )!;
    const p = present(g)[0];
    const r = giveOrder(g, p.id, { verb: 'search', object: `the ${missing}` });
    expect(r).toMatchObject({ ok: false, reason: 'absent' });
    expect(wrongOrder(g, p.name, { verb: 'search', object: `the ${missing}` }, 'absent').text).toMatch(/There is no/);
  });

  it('разведка уходит к месту своей стороны света', () => {
    let s: HoldState = { ...newGame(9), tonight: null };
    const scout = present(s)[0];
    s = endDay(giveOrder(s, scout.id, { verb: 'scout', object: 'the east' }).state);
    const east = placesOf(s.places).find((x) => x.dir === 'east')!.id;
    expect(s.people.find((p) => p.id === scout.id)!.away?.place).toBe(east);
  });

  it('событие: принятая девочка ест и пьёт, прогнанная — бьёт по настроению', () => {
    const g = { ...newGame(4), day: 5 };
    const e = makeEvent('girl', present(g)[0]);
    const took = answerEvent({ ...g, event: e }, 'take').state;
    expect(took.kids).toBe(1);
    expect(upkeep(took).food).toBe(upkeep(g).food + 1);
    expect(took.event).toBeNull();
    const sent = answerEvent({ ...g, event: e }, 'send').state;
    const avg = (s: HoldState) => present(s).reduce((n, p) => n + p.morale, 0);
    expect(avg(sent)).toBeLessThan(avg(g));
  });

  it('утром бывает или гость, или событие — не оба сразу', () => {
    let s: HoldState = newGame(12);
    for (let d = 0; d < 25 && !s.outcome; d++) {
      s = endDay({ ...s, visitor: null, event: null, tonight: null });
      expect(!!(s.visitor && s.event)).toBe(false);
    }
  });
});
