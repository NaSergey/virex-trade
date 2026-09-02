import { HabitsService } from './habits.service';
import type { Row } from './trade-rows';

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'r1',
    symbol: 'BTCUSDT',
    direction: 'long',
    closedPnl: 0,
    closedAt: new Date('2026-01-01T00:00:00Z'),
    openedAt: new Date('2026-01-01T00:00:00Z'),
    qty: 1,
    avgEntryPrice: 100,
    avgExitPrice: 100,
    parts: 1,
    entryMs: new Date('2026-01-01T00:00:00Z').getTime(),
    entryBasis: 'filled',
    holdMs: 60_000,
    notional: 100,
    tagSet: new Set(),
    session: 'asia',
    weekday: 1,
    hour: 3,
    ctx: null,
    tags: [],
    ...overrides,
  };
}

const emptyFlags = { tilt: new Set<string>(), overtrade: new Set<string>(), medNotional: 0, medHold: null };

// Приватный candidates() зовём напрямую через каст — этот метод не трогает
// this.prisma, поэтому фейковый конструктор безопасен и не тянет за собой
// поднятие Nest/Prisma ради юнит-теста.
describe('HabitsService.candidates — kind/params', () => {
  const service = new HabitsService({} as any);
  const candidates = (rows: Row[] = []) =>
    (service as any).candidates(rows, emptyFlags, null, null) as Array<{
      key: string;
      kind: string;
      params: Record<string, string | number>;
    }>;

  it('помечает поведенческий кандидат своим kind без параметров', () => {
    const tilt = candidates().find((c) => c.key === 'tilt');
    expect(tilt?.kind).toBe('tilt');
    expect(tilt?.params).toEqual({});
  });

  it('переторговка несёт nth и limit, посчитанные из константы', () => {
    const c = candidates().find((c) => c.key === 'overtrading');
    expect(c?.kind).toBe('overtrading');
    expect(c?.params).toEqual({ nth: 3, limit: 2 });
  });

  it('разгон размера несёт множитель', () => {
    const c = candidates().find((c) => c.key === 'size_up');
    expect(c?.kind).toBe('size_up');
    expect(c?.params).toEqual({ mult: 1.5 });
  });

  it('лонг/шорт — общий kind "dir", направление в params', () => {
    const long = candidates().find((c) => c.key === 'dir:long');
    const short = candidates().find((c) => c.key === 'dir:short');
    expect(long?.kind).toBe('dir');
    expect(long?.params).toEqual({ direction: 'long' });
    expect(short?.kind).toBe('dir');
    expect(short?.params).toEqual({ direction: 'short' });
  });

  it('часовое окно несёт числовые границы часа', () => {
    const c = candidates().find((c) => c.key === 'hour:8-11');
    expect(c?.kind).toBe('hour');
    expect(c?.params).toEqual({ hourFrom: 8, hourTo: 11 });
  });

  it('день недели несёт индекс 0..6', () => {
    const c = candidates().find((c) => c.key === 'weekday:3');
    expect(c?.kind).toBe('weekday');
    expect(c?.params).toEqual({ weekday: 3 });
  });

  it('сессия несёт свой ключ строкой', () => {
    const c = candidates().find((c) => c.key === 'session:london');
    expect(c?.kind).toBe('session');
    expect(c?.params).toEqual({ session: 'london' });
  });

  it('режим тренда несёт свой ключ строкой', () => {
    const c = candidates().find((c) => c.key === 'trend4h:trend_up');
    expect(c?.kind).toBe('trend4h');
    expect(c?.params).toEqual({ trend: 'trend_up' });
  });

  it('EMA200 несёт сторону above/below', () => {
    const above = candidates().find((c) => c.key === 'ema200:above');
    expect(above?.kind).toBe('ema200');
    expect(above?.params).toEqual({ side: 'above' });
  });

  it('ATR несёт уровень high/low', () => {
    const high = candidates().find((c) => c.key === 'atr:high');
    expect(high?.kind).toBe('atr');
    expect(high?.params).toEqual({ level: 'high' });
  });

  it('объём несёт уровень high/low', () => {
    const low = candidates().find((c) => c.key === 'vol:low');
    expect(low?.kind).toBe('vol');
    expect(low?.params).toEqual({ level: 'low' });
  });

  it('диапазон 4H несёт корзину low/mid/high', () => {
    const mid = candidates().find((c) => c.key === 'range4h:mid');
    expect(mid?.kind).toBe('range4h');
    expect(mid?.params).toEqual({ bucket: 'mid' });
  });

  it('тег несёт человекочитаемое имя тега в params', () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      makeRow({ id: `t${i}`, tagSet: new Set(['tag-1']), tags: [{ id: 'tag-1', name: 'Пробой', color: '#fff' }] }),
    );
    const c = candidates(rows).find((x) => x.key === 'tag:tag-1');
    expect(c?.kind).toBe('tag');
    expect(c?.params).toEqual({ tagName: 'Пробой' });
  });

  it('символ несёт тикер в params', () => {
    const rows = Array.from({ length: 12 }, (_, i) => makeRow({ id: `s${i}`, symbol: 'ETHUSDT' }));
    const c = candidates(rows).find((x) => x.key === 'symbol:ETHUSDT');
    expect(c?.kind).toBe('symbol');
    expect(c?.params).toEqual({ symbol: 'ETHUSDT' });
  });
});

describe('HabitsService.evaluate — переносит kind/params в Habit', () => {
  it('kind и params кандидата долетают до итогового Habit', () => {
    const service = new HabitsService({} as any);
    const rows = [
      ...Array.from({ length: 15 }, (_, i) => makeRow({ id: `s${i}`, direction: 'long', closedPnl: -10 })),
      ...Array.from({ length: 30 }, (_, i) => makeRow({ id: `r${i}`, direction: 'short', closedPnl: 5 })),
    ];
    const habit = (service as any).evaluate(
      {
        key: 'dir:long',
        group: 'context',
        kind: 'dir',
        params: { direction: 'long' },
        label: 'Лонги',
        advice: 'Сравнить с шортами в «Аналитике».',
        lab: { direction: 'long' },
        test: (r: Row) => r.direction === 'long',
      },
      rows,
    );
    expect(habit?.kind).toBe('dir');
    expect(habit?.params).toEqual({ direction: 'long' });
  });
});
