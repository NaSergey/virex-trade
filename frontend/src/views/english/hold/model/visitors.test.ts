import { describe, expect, it } from 'vitest';
import { rand } from '../../game/model/rng';
import { endDay, newGame, type HoldState } from './rules';
import { answerVisitor, rollVisitor, wiseAnswer, word, type Visitor } from './visitors';

const offer = { give: 'iron', giveN: 4, want: 'wood', wantN: 6 } as const;
const trader = (kind: 'trader' | 'liar'): Visitor => ({
  kind,
  speech: 'Good morning…',
  detail: kind === 'liar' ? 'His boots are red with fresh blood.' : 'His cart is full of sacks and tools.',
  options: [],
  offer: { ...offer },
});
const at = (v: Visitor): HoldState => ({ ...newGame(4), visitor: v, res: { food: 10, water: 10, wood: 10, iron: 2 } });

describe('гости у ворот', () => {
  it('гость приходит с третьего дня и не раньше', () => {
    const r = rand(9);
    const s = newGame(9);
    for (let i = 0; i < 20; i++) expect(rollVisitor(r, { ...s, day: 2 })).toBeNull();
    const seen = Array.from({ length: 60 }, () => rollVisitor(r, { ...s, day: 5 })).filter(Boolean);
    expect(seen.length).toBeGreaterThan(10);
    expect(new Set(seen.map((v) => v!.kind)).size).toBe(4);
  });

  it('у торговца и разбойника одни и те же слова и ответы — отличает только деталь', () => {
    const r = rand(3);
    const s = { ...newGame(3), day: 6 };
    const both = Array.from({ length: 80 }, () => rollVisitor(r, s)).filter(
      (v) => v && (v.kind === 'trader' || v.kind === 'liar'),
    );
    for (const v of both) {
      expect(v!.speech).toMatch(/^Good morning\. I am a trader\./);
      expect(v!.options.map((o) => o.id)).toEqual(['trade', 'check', 'refuse']);
    }
  });

  it('честная сделка меняет запасы', () => {
    const { state, lines } = answerVisitor(at(trader('trader')), 'trade');
    expect(state.res.wood).toBe(4);
    expect(state.res.iron).toBe(6);
    expect(state.visitor).toBeNull();
    expect(lines[0]).toMatch(/A good trade/);
  });

  it('впустить разбойника — грабёж, проверить руки — он бежит', () => {
    const robbed = answerVisitor(at(trader('liar')), 'trade');
    expect(robbed.state.res.food).toBe(6);
    expect(robbed.lines[0]).toMatch(/It was a trap!/);
    const checked = answerVisitor(at(trader('liar')), 'check');
    expect(checked.state.res).toEqual({ food: 10, water: 10, wood: 10, iron: 2 });
    expect(checked.lines[0]).toMatch(/runs back into the forest/);
  });

  it('раненый путник за воду открывает место на карте', () => {
    const s = at({ kind: 'traveler', speech: '', detail: '', options: [], ask: { res: 'water', n: 2 } });
    const { state } = answerVisitor(s, 'give');
    expect(state.res.water).toBe(8);
    expect(Object.values(state.places!).filter((p) => p.known)).toHaveLength(1);
  });

  it('мудрый ответ: разбойника проверить, торговцу продать, если есть чем', () => {
    expect(wiseAnswer(at(trader('liar')))).toBe('check');
    expect(wiseAnswer(at(trader('trader')))).toBe('trade');
    expect(wiseAnswer({ ...at(trader('trader')), res: { food: 0, water: 0, wood: 0, iron: 0 } })).toBe('refuse');
  });

  it('ночь снимает неотвеченного гостя и может привести нового', () => {
    const s = endDay({ ...at(trader('trader')), tonight: null });
    expect(s.visitor == null || !!s.visitor.kind).toBe(true);
    expect(word(7)).toBe('seven');
  });
});
