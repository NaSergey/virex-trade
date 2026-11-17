import { describe, expect, it } from 'vitest';
import { decodeLayout, decodePanes, encodePanes, fillPanes, paneCount } from './panes';

const TFS = [1, 5, 15, 60, 240];
const COINS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT'];

describe('panes', () => {
  it('число графиков у раскладки', () => {
    expect([paneCount('1'), paneCount('2h'), paneCount('2v'), paneCount('3'), paneCount('4')]).toEqual([1, 2, 2, 3, 4]);
  });

  it('раскладка из хранилища: неизвестная — один график', () => {
    expect(decodeLayout('4')).toBe('4');
    expect(decodeLayout('9')).toBe('1');
    expect(decodeLayout(null)).toBe('1');
  });

  it('состав строкой туда и обратно; битое и чужие ТФ отбрасываются', () => {
    const panes = [
      { symbol: 'BTCUSDT', tf: 15 },
      { symbol: 'ETHUSDT', tf: 240 },
    ];
    expect(decodePanes(encodePanes(panes), TFS)).toEqual(panes);
    expect(decodePanes('мусор', TFS)).toEqual([]);
    expect(decodePanes('BTCUSDT:7,ETHUSDT:60', TFS)).toEqual([{ symbol: 'ETHUSDT', tf: 60 }]);
    expect(decodePanes(null, TFS)).toEqual([]);
  });

  it('растёт с 1 до 4 — разные монеты по порядку списка, с ТФ активного', () => {
    expect(fillPanes([{ symbol: 'ETHUSDT', tf: 15 }], 4, COINS, 60)).toEqual([
      { symbol: 'ETHUSDT', tf: 15 },
      { symbol: 'BTCUSDT', tf: 60 },
      { symbol: 'SOLUSDT', tf: 60 },
      { symbol: 'XRPUSDT', tf: 60 },
    ]);
  });

  it('с 4 до 2 — лишние сохраняются', () => {
    const four = fillPanes([], 4, COINS, 60);
    expect(fillPanes(four, 2, COINS, 60)).toEqual(four);
  });

  it('монета, которой больше нет у рынка, заменяется свободной', () => {
    expect(fillPanes([{ symbol: 'GONEUSDT', tf: 15 }, { symbol: 'BTCUSDT', tf: 60 }], 2, COINS, 60)).toEqual([
      { symbol: 'ETHUSDT', tf: 15 },
      { symbol: 'BTCUSDT', tf: 60 },
    ]);
  });

  it('свободных монет нет — повтор первой', () => {
    expect(fillPanes([], 3, ['BTCUSDT', 'ETHUSDT'], 60).map((p) => p.symbol)).toEqual(['BTCUSDT', 'ETHUSDT', 'BTCUSDT']);
  });
});
