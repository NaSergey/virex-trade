import { METRICS, metricByKey } from './metric-catalog';

describe('каталог метрик', () => {
  it('отдаёт метрику по ключу', () => {
    expect(metricByKey('planned_risk_pct')).toMatchObject({ window: 'trade', unit: 'pct' });
  });

  it('неизвестный ключ — undefined, а не исключение', () => {
    // Правило может ссылаться на метрику, исчезнувшую при откате версии кода.
    // Такое правило показывается выключенным, а не роняет экран.
    expect(metricByKey('нет такой')).toBeUndefined();
  });

  it('ключи уникальны', () => {
    const keys = METRICS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // Живые данные показали экспозицию до 412%: у фьючерсного трейдера номинал
  // кратно больше депозита. Порог по умолчанию в десятках процентов обесценил
  // бы метрику с первого экрана — человек увидел бы «нарушено везде».
  it('порог экспозиции по умолчанию учитывает торговлю с плечом', () => {
    expect(metricByKey('exposure_pct')!.defaultThreshold).toBeGreaterThanOrEqual(100);
  });

  it('каждая метрика объявляет окно, единицу и умолчания', () => {
    for (const m of METRICS) {
      expect(['trade', 'day']).toContain(m.window);
      expect(['pct', 'x', 'count']).toContain(m.unit);
      expect(['lte', 'gte']).toContain(m.defaultOperator);
      expect(Number.isFinite(m.defaultThreshold)).toBe(true);
    }
  });
});
