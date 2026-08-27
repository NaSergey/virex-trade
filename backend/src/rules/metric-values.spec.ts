import { dayMetricValues, localDayKey, tradeMetricValues, type TradeRow } from './metric-values';

const row = (over: Partial<TradeRow> & { id: string }): TradeRow => ({
  closedAt: new Date('2026-08-01T12:00:00Z'),
  closedPnl: 0,
  leverage: null,
  risk: { exposurePct: 30, plannedRiskPct: 2, ok: true, balanceAtEntry: 1000 },
  ...over,
});

describe('tradeMetricValues', () => {
  it('берёт экспозицию из посчитанных метрик риска', () => {
    expect(tradeMetricValues('exposure_pct', [row({ id: 't1' })])).toEqual([
      { subjectId: 't1', value: 30 },
    ]);
  });

  // «Нет данных» и «ноль» — разные вещи. Ноль соблюдал бы любое правило,
  // и сделка без стопа тихо засчиталась бы в дисциплинированные.
  it('сделка без стопа даёт null, а не ноль', () => {
    const r = row({ id: 't1', risk: { exposurePct: 30, plannedRiskPct: null, ok: true, balanceAtEntry: 1000 } });
    expect(tradeMetricValues('planned_risk_pct', [r])).toEqual([{ subjectId: 't1', value: null }]);
  });

  it('сделка без посчитанного риска даёт null по любой метрике риска', () => {
    const r = row({ id: 't1', risk: null });
    expect(tradeMetricValues('exposure_pct', [r])).toEqual([{ subjectId: 't1', value: null }]);
  });

  it('риск с ok=false даёт null, даже если числа в строке есть', () => {
    const r = row({ id: 't1', risk: { exposurePct: 30, plannedRiskPct: 2, ok: false, balanceAtEntry: null } });
    expect(tradeMetricValues('exposure_pct', [r])).toEqual([{ subjectId: 't1', value: null }]);
  });

  it('плечо берётся из сделки, а не из метрик риска', () => {
    expect(tradeMetricValues('leverage', [row({ id: 't1', leverage: 10 })])).toEqual([
      { subjectId: 't1', value: 10 },
    ]);
  });

  it('биржа не отдала плечо — null', () => {
    expect(tradeMetricValues('leverage', [row({ id: 't1', leverage: null })])).toEqual([
      { subjectId: 't1', value: null },
    ]);
  });
});

describe('localDayKey', () => {
  // tzOffsetMin приходит из getTimezoneOffset(): для UTC+3 это -180.
  it('режет сутки по локальной зоне, а не по UTC', () => {
    expect(localDayKey(new Date('2026-08-01T22:30:00Z'), -180)).toBe('2026-08-02');
  });

  it('в UTC совпадает с календарной датой', () => {
    expect(localDayKey(new Date('2026-08-01T22:30:00Z'), 0)).toBe('2026-08-01');
  });
});

describe('dayMetricValues', () => {
  const day = (id: string, iso: string, pnl: number): TradeRow =>
    row({ id, closedAt: new Date(iso), closedPnl: pnl });

  it('считает число сделок за локальные сутки', () => {
    const rows = [
      day('t1', '2026-08-01T10:00:00Z', 0),
      day('t2', '2026-08-01T11:00:00Z', 0),
      day('t3', '2026-08-02T10:00:00Z', 0),
    ];
    expect(dayMetricValues('trades_per_day', rows, 0)).toEqual([
      { subjectId: '2026-08-01', value: 2 },
      { subjectId: '2026-08-02', value: 1 },
    ]);
  });

  // Убыток положительным числом: правило звучит «дневной убыток не больше 5%»,
  // и сравнивать порог с отрицательной величиной значило бы требовать от
  // пользователя думать про знак. Прибыльный день даёт 0, а не отрицание.
  it('дневной убыток считается от баланса на начало суток и подаётся положительным', () => {
    const rows = [
      day('t1', '2026-08-01T10:00:00Z', -30),
      day('t2', '2026-08-01T11:00:00Z', -20),
    ];
    expect(dayMetricValues('daily_loss_pct', rows, 0)).toEqual([
      { subjectId: '2026-08-01', value: 5 },
    ]);
  });

  it('прибыльный день даёт нулевой убыток, а не отрицательный', () => {
    const rows = [day('t1', '2026-08-01T10:00:00Z', 40)];
    expect(dayMetricValues('daily_loss_pct', rows, 0)).toEqual([
      { subjectId: '2026-08-01', value: 0 },
    ]);
  });

  // Баланс на начало суток берётся из первой сделки дня. Если он неизвестен,
  // день выпадает из проверки целиком — так же, как сделка без баланса.
  it('день без известного баланса даёт null', () => {
    const r = row({
      id: 't1',
      closedAt: new Date('2026-08-01T10:00:00Z'),
      closedPnl: -30,
      risk: { exposurePct: null, plannedRiskPct: null, ok: false, balanceAtEntry: null },
    });
    expect(dayMetricValues('daily_loss_pct', [r], 0)).toEqual([
      { subjectId: '2026-08-01', value: null },
    ]);
  });
});
