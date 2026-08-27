import { describe, expect, it } from 'vitest';
import {
  getMetricLabelKey,
  getUnitTypeForMetric,
  getSupportedMetricKeys,
  type MetricKey,
} from './metric-labels';

/**
 * Тесты для сопоставления ключей метрик на подписи и единицы.
 *
 * Этот дефект пережил девять ревью потому, что типы не помогали: ключи
 * приходили со снейк-кейсом с бэкенда, но карты были в кэмелкейсе, и
 * TypeScript не видел несовпадения (Record<string, string> принимает любой
 * ключ). Тесты должны падать при первом же расхождении бэкенда и фронта.
 */

describe('getMetricLabelKey', () => {
  const supportedKeys: MetricKey[] = [
    'exposure_pct',
    'planned_risk_pct',
    'leverage',
    'trades_per_day',
    'daily_loss_pct',
  ];

  it('каждый поддерживаемый ключ находит свою подпись', () => {
    for (const key of supportedKeys) {
      const labelKey = getMetricLabelKey(key);
      // Ключи не должны совпадать с входом: exposure_pct должен отобразиться на
      // metricExposurePct, не остаться в покое. Если они совпадают, значит
      // логика отката к сырому ключу и маппинг запутались.
      expect(labelKey).not.toBe(key);
      // Все должны начинаться с 'metric', чтобы отличить от откатов.
      expect(labelKey).toMatch(/^metric/);
    }
  });

  it('все пять метрик отображаются правильно', () => {
    expect(getMetricLabelKey('exposure_pct')).toBe('metricExposurePct');
    expect(getMetricLabelKey('planned_risk_pct')).toBe('metricPlannedRiskPct');
    expect(getMetricLabelKey('leverage')).toBe('metricLeverage');
    expect(getMetricLabelKey('trades_per_day')).toBe('metricTradesPerDay');
    expect(getMetricLabelKey('daily_loss_pct')).toBe('metricDailyLossPct');
  });

  it('неизвестный ключ откатывается к сырому значению', () => {
    expect(getMetricLabelKey('unknown_metric')).toBe('unknown_metric');
    expect(getMetricLabelKey('some_future_metric')).toBe('some_future_metric');
  });

  it('пустая строка откатывается как есть', () => {
    expect(getMetricLabelKey('')).toBe('');
  });
});

describe('getUnitTypeForMetric', () => {
  it('каждый ключ метрики получает правильный тип единицы', () => {
    expect(getUnitTypeForMetric('exposure_pct')).toBe('pct');
    expect(getUnitTypeForMetric('planned_risk_pct')).toBe('pct');
    expect(getUnitTypeForMetric('leverage')).toBe('x');
    expect(getUnitTypeForMetric('trades_per_day')).toBe('count');
    expect(getUnitTypeForMetric('daily_loss_pct')).toBe('pct');
  });

  it('неизвестный ключ откатывается к безопасному значению x', () => {
    expect(getUnitTypeForMetric('unknown')).toBe('x');
    expect(getUnitTypeForMetric('future_metric')).toBe('x');
  });
});

describe('getSupportedMetricKeys', () => {
  it('возвращает ровно пять ключей', () => {
    const keys = getSupportedMetricKeys();
    expect(keys).toHaveLength(5);
  });

  it('содержит все пять ожидаемых ключей', () => {
    const keys = getSupportedMetricKeys();
    expect(keys).toContain('exposure_pct');
    expect(keys).toContain('planned_risk_pct');
    expect(keys).toContain('leverage');
    expect(keys).toContain('trades_per_day');
    expect(keys).toContain('daily_loss_pct');
  });
});

/**
 * Кросс-проверка: если ключ поддерживается, он должен иметь сопоставление
 * на подпись и единицу. Это поймает случай, если один был забыт где-то.
 */
describe('Консистентность подписей и единиц', () => {
  it('каждый ключ имеет и подпись, и единицу', () => {
    const keys = getSupportedMetricKeys();
    for (const key of keys) {
      const labelKey = getMetricLabelKey(key);
      const unit = getUnitTypeForMetric(key);
      // Обе должны быть непустыми и не откатываться к сырому ключу.
      expect(labelKey).not.toBe(key);
      expect(['pct', 'x', 'count']).toContain(unit);
    }
  });
});
