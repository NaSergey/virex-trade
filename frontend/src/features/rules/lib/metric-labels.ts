/**
 * Сопоставления ключей метрик на ключи локализации и единицы.
 *
 * Ключи метрик приходят с бэкенда в snake_case и должны приводиться к
 * человеческому виду. Этот модуль сосредотачивает логику, чтобы избежать
 * дублирования в трёх компонентах и упростить тестирование.
 */

/**
 * Типы метрик, которые может отдать бэкенд.
 * Должны совпадать с ключами в backend/src/rules/metric-catalog.ts.
 */
export type MetricKey = 'exposure_pct' | 'planned_risk_pct' | 'leverage' | 'trades_per_day' | 'daily_loss_pct';

/** Типы единиц для метрик. */
export type UnitType = 'pct' | 'x' | 'count';

/**
 * Маппирование ключей метрик на ключи локализации подписей.
 * Ключи должны совпадать с поддерживаемыми метриками каталога бэкенда.
 */
const METRIC_LABEL_KEYS: Record<MetricKey, string> = {
  exposure_pct: 'metricExposurePct',
  planned_risk_pct: 'metricPlannedRiskPct',
  leverage: 'metricLeverage',
  trades_per_day: 'metricTradesPerDay',
  daily_loss_pct: 'metricDailyLossPct',
};

/**
 * Маппирование ключей метрик на типы единиц.
 * Источник: backend/src/rules/metric-catalog.ts, поле unit.
 */
const METRIC_UNIT_TYPES: Record<MetricKey, UnitType> = {
  exposure_pct: 'pct',
  planned_risk_pct: 'pct',
  leverage: 'x',
  trades_per_day: 'count',
  daily_loss_pct: 'pct',
};

/**
 * Получить ключ локализации для подписи метрики.
 * Если метрика неизвестна, вернуть сырой ключ.
 */
export function getMetricLabelKey(metricKey: string): string {
  return METRIC_LABEL_KEYS[metricKey as MetricKey] ?? metricKey;
}

/**
 * Получить тип единицы для метрики.
 * Если метрика неизвестна, вернуть 'x' (безопасный откат).
 */
export function getUnitTypeForMetric(metricKey: string): UnitType {
  return METRIC_UNIT_TYPES[metricKey as MetricKey] ?? 'x';
}

/**
 * Получить все поддерживаемые ключи метрик.
 * Используется в тестах и валидации.
 */
export function getSupportedMetricKeys(): MetricKey[] {
  return Object.keys(METRIC_LABEL_KEYS) as MetricKey[];
}
