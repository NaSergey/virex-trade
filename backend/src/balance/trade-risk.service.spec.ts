import { riskOf } from './trade-risk.service';

const TRADE = {
  qty: 0.5,
  avgEntryPrice: 60000,
  stopLoss: null as number | null,
};

describe('riskOf', () => {
  it('считает экспозицию как долю депозита в позиции', () => {
    // 0.5 × 60000 = 30000 номинала при депозите 100000 → 30%
    expect(riskOf(TRADE, 100000)).toMatchObject({ exposurePct: 30, plannedRiskPct: null, ok: true });
  });

  it('считает плановый риск от стопа', () => {
    // 0.5 × |60000 − 59000| = 500 при депозите 100000 → 0.5%
    expect(riskOf({ ...TRADE, stopLoss: 59000 }, 100000)).toMatchObject({ plannedRiskPct: 0.5 });
  });

  // Шорт: стоп выше входа. Модуль разности держит обе стороны на одной
  // формуле — без него у шорта риск получался отрицательным, и правило
  // «риск ≤ 2%» соблюдалось бы тем охотнее, чем дальше стоял стоп.
  it('считает плановый риск шорта со стопом выше входа', () => {
    expect(riskOf({ ...TRADE, stopLoss: 61000 }, 100000)).toMatchObject({ plannedRiskPct: 0.5 });
  });

  // Отсутствие стопа — это не нулевой риск и не полный: это «не знаем».
  // Ноль соблюдал бы любое правило, 100% нарушал бы любое, и оба варианта
  // врут о том, чего мы не измеряли.
  it('без стопа отдаёт null, но экспозицию считает', () => {
    expect(riskOf(TRADE, 100000)).toMatchObject({ exposurePct: 30, plannedRiskPct: null });
  });

  it('без баланса отдаёт ok: false и обе метрики null', () => {
    expect(riskOf({ ...TRADE, stopLoss: 59000 }, null)).toEqual({
      exposurePct: null,
      plannedRiskPct: null,
      ok: false,
    });
  });

  // Нулевой баланс — это не «депозит слит в ноль», это деление на ноль.
  it('нулевой баланс отдаёт ok: false, а не Infinity', () => {
    expect(riskOf(TRADE, 0)).toMatchObject({ ok: false, exposurePct: null });
  });
});
