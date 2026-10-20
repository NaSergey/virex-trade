import { tradesOf } from './trades';
import type { RawFill } from './hl-types';

let t = 0;
/** Исполнение: `start` — размер позиции до него (со знаком), `sz` — объём, `buy` — покупка. */
const fill = (
  coin: string,
  buy: boolean,
  sz: number,
  start: number,
  px = 100,
  extra: Partial<RawFill> = {},
): RawFill => ({
  coin,
  px: String(px),
  sz: String(sz),
  side: buy ? 'B' : 'A',
  time: ++t * 1000,
  dir: '',
  startPosition: String(start),
  closedPnl: '0',
  fee: '0.1',
  crossed: true,
  ...extra,
});

describe('tradesOf — исполнения в сделки', () => {
  beforeEach(() => {
    t = 0;
  });

  it('десять исполнений одной позиции — одна сделка', () => {
    const raw: RawFill[] = [];
    let pos = 0;
    for (let i = 0; i < 5; i++) {
      raw.push(fill('ETH', true, 1, pos, 100 + i));
      pos += 1;
    }
    for (let i = 0; i < 5; i++) {
      raw.push(fill('ETH', false, 1, pos, 110, { closedPnl: '4' }));
      pos -= 1;
    }
    const { trades, fillsCount } = tradesOf(raw);
    expect(fillsCount).toBe(10);
    expect(trades).toHaveLength(1);
    const [tr] = trades;
    expect(tr).toMatchObject({
      coin: 'ETH',
      side: 'long',
      partial: false,
      entryPx: 102,
      exitPx: 110,
      peakSize: 5,
    });
    expect(tr.closedAt).toBe(10_000);
    expect(tr.fills).toHaveLength(10);
    expect(tr.fills[0].time).toBe(10_000);
    // 5 × 4 закрытого результата минус 10 × 0.1 комиссии
    expect(tr.pnl).toBeCloseTo(19, 9);
    expect(tr.notional).toBeCloseTo(510, 9);
  });

  it('две позиции подряд — две сделки, новые первыми', () => {
    const { trades } = tradesOf([
      fill('BTC', true, 1, 0),
      fill('BTC', false, 1, 1),
      fill('BTC', false, 2, 0),
      fill('BTC', true, 2, -2),
    ]);
    expect(trades.map((x) => x.side)).toEqual(['short', 'long']);
    expect(trades.every((x) => x.closedAt != null)).toBe(true);
  });

  it('монеты не мешаются: у каждой своя позиция', () => {
    const { trades, coins } = tradesOf([
      fill('BTC', true, 1, 0),
      fill('ETH', true, 3, 0),
      fill('BTC', false, 1, 1),
    ]);
    expect(trades).toHaveLength(2);
    expect(trades.find((x) => x.coin === 'ETH')!.closedAt).toBeNull();
    // по числу сделок поровну — выше та, где оборот больше
    expect(coins.map((c) => c.coin)).toEqual(['ETH', 'BTC']);
  });

  it('разворот делится: старая сделка закрыта, остаток открывает новую', () => {
    const { trades } = tradesOf([
      fill('SOL', true, 2, 0, 100),
      // продал 5 при лонге 2: закрыл 2, открыл шорт 3
      fill('SOL', false, 5, 2, 110, { closedPnl: '20', fee: '1' }),
      fill('SOL', true, 3, -3, 105, { closedPnl: '15' }),
    ]);
    expect(trades).toHaveLength(2);
    const [second, first] = trades;
    expect(first).toMatchObject({ side: 'long', exitPx: 110, peakSize: 2 });
    expect(first.fills[0].size).toBeCloseTo(2, 9);
    expect(first.fee).toBeCloseTo(0.1 + 0.4, 9);
    expect(second).toMatchObject({ side: 'short', entryPx: 110, peakSize: 3 });
    expect(second.fills[0].size).toBeCloseTo(3, 9);
    expect(second.closedAt).not.toBeNull();
  });

  it('история начинается посреди сделки — partial, вход неизвестен', () => {
    const { trades } = tradesOf([
      fill('BTC', false, 1, 3, 120, { closedPnl: '5' }),
      fill('BTC', false, 2, 2, 125, { closedPnl: '10' }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      side: 'long',
      partial: true,
      entryPx: null,
    });
    expect(trades[0].closedAt).not.toBeNull();
    expect(trades[0].notional).toBeGreaterThan(0);
  });

  it('без startPosition размер ведётся по исполнениям', () => {
    const raw = [fill('ETH', true, 2, 0), fill('ETH', false, 2, 0)].map(
      ({ startPosition: _s, ...f }) => f as RawFill,
    );
    const { trades } = tradesOf(raw);
    expect(trades).toHaveLength(1);
    expect(trades[0].closedAt).not.toBeNull();
  });

  it('погрешность строк не оставляет сделку открытой', () => {
    const { trades } = tradesOf([
      fill('PEPE', true, 1234567.1, 0),
      fill('PEPE', false, 1234567.1, 1234567.1),
    ]);
    expect(trades[0].closedAt).not.toBeNull();
  });

  it('статистика по монетам: доля сделок, оборот, итог', () => {
    const { coins } = tradesOf([
      fill('BTC', true, 1, 0, 100),
      fill('BTC', false, 1, 1, 110, { closedPnl: '10' }),
      fill('BTC', true, 1, 0, 100),
      fill('BTC', false, 1, 1, 90, { closedPnl: '-10' }),
      fill('ETH', true, 2, 0, 50),
    ]);
    expect(coins[0]).toMatchObject({ coin: 'BTC', trades: 2 });
    expect(coins[0].share).toBeCloseTo(2 / 3, 9);
    expect(coins[0].volume).toBeCloseTo(100 + 110 + 100 + 90, 9);
    expect(coins[0].pnl).toBeCloseTo(-0.4, 9);
  });

  it('пустой ответ — пусто', () => {
    expect(tradesOf(undefined as never)).toMatchObject({
      trades: [],
      coins: [],
      fillsCount: 0,
      since: null,
    });
  });
});
