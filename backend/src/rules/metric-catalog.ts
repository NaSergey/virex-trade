/**
 * Каталог метрик, по которым можно объявить правило.
 *
 * Константа в коде, а не таблица в базе: набор метрик меняется вместе с
 * формулами, которые их считают, и хранить его отдельно от кода значило бы
 * позволить базе ссылаться на формулу, которой больше нет.
 *
 * Подписи здесь не живут — они на фронте, в файлах локализации: одна и та же
 * метрика называется по-разному на двух языках, а бэкенд про язык не знает.
 */

export type MetricWindow = 'trade' | 'day';
export type MetricUnit = 'pct' | 'x' | 'count';

export interface MetricDef {
  key: string;
  /** Окно — свойство метрики, а не правила. Отсюда его нет в модели Rule. */
  window: MetricWindow;
  unit: MetricUnit;
  defaultOperator: 'lte' | 'gte';
  /** Подставляется в форму при выборе метрики — чтобы поле не было пустым. */
  defaultThreshold: number;
}

export const METRICS: readonly MetricDef[] = [
  /**
   * Номинал позиции к депозиту, не маржа. У фьючерсного трейдера это по сути
   * плечо, умноженное на сто: на живом аккаунте встречались значения за 400%.
   * Поэтому и умолчание в сотнях процентов — порог «50» показал бы нарушение
   * на каждой сделке и метрика умерла бы на первом экране.
   */
  { key: 'exposure_pct', window: 'trade', unit: 'pct', defaultOperator: 'lte', defaultThreshold: 200 },
  /**
   * Сколько потерял бы трейдер, сработай его стоп. Единственная метрика,
   * которая меряет намерение, а не размер, — и единственная, требующая стопа
   * на бирже. У кого стоп в голове, у того она пустая.
   */
  { key: 'planned_risk_pct', window: 'trade', unit: 'pct', defaultOperator: 'lte', defaultThreshold: 2 },
  { key: 'leverage', window: 'trade', unit: 'x', defaultOperator: 'lte', defaultThreshold: 5 },
  { key: 'trades_per_day', window: 'day', unit: 'count', defaultOperator: 'lte', defaultThreshold: 5 },
  { key: 'daily_loss_pct', window: 'day', unit: 'pct', defaultOperator: 'lte', defaultThreshold: 5 },
];

const BY_KEY = new Map(METRICS.map((m) => [m.key, m]));

/** undefined, а не исключение: правило может пережить исчезновение метрики. */
export function metricByKey(key: string): MetricDef | undefined {
  return BY_KEY.get(key);
}
