import { describe, expect, it } from 'vitest';
import { draftLevels, type DraftLevelsInput } from './draft-levels';

const base: DraftLevelsInput = {
  tab: 'market',
  market: { stop: 0, take: null, risk: 1 },
  limit: { entry: null, stop: 0, take: null, risk: 1 },
  scaled: { upper: null, lower: null, stop: 0, take: null, count: 3, risk: 1 },
  livePrice: 60_000,
  screenPrice: 60_000,
  balance: 10_000,
  leverage: 10,
  scale: 1,
};

const ids = (input: Partial<DraftLevelsInput>) => draftLevels({ ...base, ...input }).map((l) => l.id);

describe('draftLevels', () => {
  it('пустой черновик линий не даёт', () => {
    expect(ids({})).toEqual([]);
  });

  it('«Маркет»: стоп с размером по риску и тейк с результатом', () => {
    const levels = draftLevels({ ...base, market: { stop: 59_500, take: 61_000, risk: 1 } });
    expect(levels.map((l) => l.id)).toEqual(['draft-stop', 'draft-take']);
    // 1 % от 10 000 = 100 USDT; до стопа 500 → 0.2 монеты.
    expect(levels[0].qty).toBeCloseTo(0.2, 10);
    expect(levels[0].draggable).toBe(true);
    // Тейк в 1000 выше при 0.2 монеты — плюс двести без комиссий.
    expect(levels[1].impactAt!(61_000)).toBeGreaterThan(180);
    expect(levels[1].impactAt!(61_000)).toBeLessThan(200);
  });

  it('тейк не по ту сторону от стопа не рисуется', () => {
    // Стоп ниже цены — лонг, и тейк ниже цены ему не цель.
    expect(ids({ market: { stop: 59_500, take: 59_800, risk: 1 } })).toEqual(['draft-stop']);
  });

  it('рисуется только черновик открытой вкладки', () => {
    const drafts = {
      market: { stop: 59_500, take: null, risk: 1 },
      limit: { entry: 59_800, stop: 59_400, take: 60_500, risk: 1 },
      scaled: { upper: 59_900, lower: 59_600, stop: 59_300, take: 61_000, count: 3, risk: 1 },
    };
    expect(ids({ ...drafts, tab: 'market' })).toEqual(['draft-stop']);
    expect(ids({ ...drafts, tab: 'limit' })).toEqual(['draft-limit-entry', 'draft-limit-stop', 'draft-limit-take']);
    expect(ids({ ...drafts, tab: 'scaled' })).toEqual(['draft-grid-upper', 'draft-grid-lower', 'draft-grid-stop', 'draft-grid-take']);
  });

  it('лимит считает размер от своей цены входа, а не от рыночной', () => {
    const [entry] = draftLevels({ ...base, tab: 'limit', limit: { entry: 59_800, stop: 59_400, take: null, risk: 1 } });
    // До стопа 400 от входа 59 800 → 0.25 монеты; от рынка вышло бы 100 / 600.
    expect(entry.qty).toBeCloseTo(0.25, 10);
  });

  it('без цены линий нет', () => {
    expect(ids({ livePrice: null, screenPrice: null, market: { stop: 59_500, take: 61_000, risk: 1 } })).toEqual([]);
  });

  it('скрытая цена: уровни в экранных единицах, размер — от настоящих', () => {
    // Масштаб 0.01: на экране 600, в базе 60 000.
    const [stop] = draftLevels({ ...base, scale: 0.01, screenPrice: 600, market: { stop: 595, take: null, risk: 1 } });
    expect(stop.price).toBe(595);
    expect(stop.qty).toBeCloseTo(0.2, 10);
  });
});
