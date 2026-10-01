import { describe, expect, it } from 'vitest';
import { SOUNDS, thin, tickDelays } from './sounds';

describe('thin — одинаковые звуки в один момент звучат одним', () => {
  it('расчёт трёх мест разом — один звук, разные звуки не мешают друг другу', () => {
    const out = thin([
      { sound: 'sweep', delay: 500 },
      { sound: 'win', delay: 500 },
      { sound: 'sweep', delay: 500 },
      { sound: 'sweep', delay: 520 },
    ]);
    expect(out).toEqual([
      { sound: 'sweep', delay: 500 },
      { sound: 'win', delay: 500 },
    ]);
  });

  it('карты сдачи с шагом раздачи остаются каждая своей', () => {
    const deal = [0, 110, 220].map((delay) => ({ sound: 'deal' as const, delay }));
    expect(thin([...deal].reverse())).toEqual(deal);
  });
});

describe('tickDelays — последние пять секунд хода', () => {
  it('ход только начался — пять тиков, раз в секунду до дедлайна', () => {
    expect(tickDelays(20_000, 0)).toEqual([15_000, 16_000, 17_000, 18_000, 19_000]);
  });

  it('открыл стол посреди последних секунд — прошедшие тики не звучат', () => {
    expect(tickDelays(20_000, 17_500)).toEqual([500, 1500]);
  });

  it('дедлайн прошёл — тишина', () => {
    expect(tickDelays(20_000, 21_000)).toEqual([]);
  });
});

describe('SOUNDS', () => {
  it('сигналы — только ход и тиканье: остальное — звуки стола и молчит в фоне', () => {
    const signals = Object.entries(SOUNDS)
      .filter(([, d]) => d.signal)
      .map(([k]) => k);
    expect(signals).toEqual(['turn', 'tick']);
  });
});
