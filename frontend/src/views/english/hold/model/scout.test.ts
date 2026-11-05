import { describe, expect, it } from 'vitest';
import { endDay, giveOrder, newGame, present, alive, withPlaces, type HoldState } from './rules';
import { answerReport, makePlaces, makeReport, placesOf } from './scout';
import { rand } from '../../game/model/rng';

const calm = (s: HoldState): HoldState => ({ ...s, tonight: null });

describe('разведка', () => {
  it('разведчик уходит на день и возвращается с докладом', () => {
    let s = calm(newGame(3, { classic: true }));
    const r = giveOrder(s, 'ash', { verb: 'scout', object: 'the north' });
    expect(r.ok).toBe(true);
    s = endDay(r.state);
    const ash = s.people.find((p) => p.id === 'ash')!;
    expect(ash.away).toEqual({ back: 3, place: 'mill' });
    expect(present(s).map((p) => p.id)).not.toContain('ash');
    expect(alive(s).map((p) => p.id)).toContain('ash');
    // В пути приказов нет.
    expect(giveOrder(s, 'ash', { verb: 'chop', object: 'wood' }).ok).toBe(false);
    s = endDay(calm(s));
    expect(s.people.find((p) => p.id === 'ash')!.away).toBeNull();
    expect(s.reports).toHaveLength(1);
    expect(s.reports![0].place).toBe('mill');
    expect(s.report.some((l) => l.startsWith('Ash came back from the north'))).toBe(true);
  });

  it('верный ответ открывает место, неверный оставляет в тумане', () => {
    let s = calm(newGame(5, { classic: true }));
    s = endDay(giveOrder(s, 'ash', { verb: 'scout', object: 'the west' }).state);
    s = endDay(calm(s));
    const rep = s.reports![0];
    const right = answerReport(s, rep.answer);
    expect(right.ok).toBe(true);
    expect(right.state.places!.cave!.known).toBe(true);
    expect(right.state.reports).toHaveLength(0);
    const wrong = answerReport(s, (rep.answer + 1) % rep.options.length);
    expect(wrong.ok).toBe(false);
    expect(wrong.state.places!.cave!.known).toBe(false);
    expect(wrong.state.stats.mistakes).toBe(s.stats.mistakes + 1);
  });

  it('обыскать можно только понятое место и только раз', () => {
    let s = calm(newGame(8, { classic: true }));
    expect(giveOrder(s, 'mira', { verb: 'search', object: 'the farm' })).toMatchObject({ ok: false, reason: 'unknown' });
    s = {
      ...s,
      places: { ...s.places!, farm: { loot: 'food', amount: 10, danger: 'wolves', known: true, looted: false } },
    };
    const food = s.res.food;
    s = endDay(giveOrder(s, 'mira', { verb: 'search', object: 'the farm' }).state);
    // 10 найдено, 8 съели вчетвером.
    expect(s.res.food).toBe(food + 10 - 8);
    expect(s.people.find((p) => p.id === 'mira')!.hp).toBeLessThan(5);
    expect(s.report.some((l) => l.includes('Wolves attacked Mira at the farm'))).toBe(true);
    expect(giveOrder(calm(s), 'mira', { verb: 'search', object: 'the farm' })).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('в докладе есть ответ на вопрос, среди вариантов — верный', () => {
    const r = rand(11);
    const places = makePlaces(r);
    for (const { id, p } of placesOf(places)) {
      const rep = makeReport(r, 'ash', id, p);
      expect(rep.lines).toHaveLength(3);
      expect(rep.options.length).toBe(3);
      expect(rep.answer).toBeGreaterThanOrEqual(0);
    }
  });

  it('старая игра без мест получает их при чтении', () => {
    const { places: _p, reports: _r, ...old } = newGame(2, { classic: true });
    void _p;
    void _r;
    const s = withPlaces(old as HoldState);
    expect(Object.keys(s.places!)).toEqual(['mill', 'ruins', 'farm', 'cave']);
  });
});
