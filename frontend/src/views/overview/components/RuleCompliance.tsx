'use client';

import { useTranslations } from 'next-intl';
import { useCompliance, useRules, type RuleCompliance as RuleComplianceRow } from '@/features/rules';
import { SectionHead } from '@/shared/ui/SectionHead';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Lookup, KeyValue } from '@/shared/ui/Lookup';
import { Skeleton } from '@/shared/ui/Skeleton';
import { ErrorNote } from '@/shared/ui/ErrorNote';

/**
 * Маппирование ключей метрик на ключи локализации для подписей.
 */
function getMetricLabel(metricKey: string, t: (key: string) => string): string {
  const labelMap: Record<string, string> = {
    exposurePct: t('metricExposurePct'),
    plannedRiskPct: t('metricPlannedRiskPct'),
    leverage: t('metricLeverage'),
    tradesPerDay: t('metricTradesPerDay'),
    dailyLossPct: t('metricDailyLossPct'),
  };
  return labelMap[metricKey] ?? metricKey;
}

/**
 * Маппирование типов единиц на ключи локализации.
 * Поддерживаемые типы: 'pct', 'x', 'count'.
 */
function getUnitLabel(unitType: string, t: (key: string) => string): string {
  const unitMap: Record<string, string> = {
    'pct': t('unitPct'),
    'x': t('unitX'),
    'count': t('unitCount'),
  };
  return unitMap[unitType] ?? unitType;
}

/**
 * Маппирование операторов на ключи локализации.
 */
function getOperatorLabel(operator: 'lte' | 'gte', t: (key: string) => string): string {
  return operator === 'lte' ? t('opLte') : t('opGte');
}

interface RuleComplianceProps {
  /** Дни периода для запроса данных о соблюдении. */
  days: number;
}

/**
 * Блок соблюдения объявленных правил на странице Обзор.
 *
 * Показывает, на сколько процентов пользователь соблюдает каждое из своих правил,
 * и обязательно отображает число непроверенных сделок рядом с долей соблюдения.
 * Непроверенные никогда не прячутся — доля без этого числа была бы враньём в
 * приятную сторону.
 *
 * Три состояния:
 * 1. Правил вообще нет → EmptyState со ссылкой на настройки.
 * 2. Правила есть, но за период нет сделок для проверки → пояснительная строка.
 * 3. Есть данные для проверки → таблица соблюдения с долями и числом непроверенных.
 */
export function RuleCompliance({ days }: RuleComplianceProps) {
  const t = useTranslations('rules');
  const { data: complianceData, isLoading, error } = useCompliance(days);
  const { data: rulesData } = useRules();
  const rules = complianceData?.rules ?? [];
  const metrics = rulesData?.metrics ?? [];

  // Если загружается — показать скелет.
  if (isLoading) {
    return (
      <div style={{ marginTop: 'var(--s5)' }}>
        <SectionHead title={t('overviewTitle')} />
        <Skeleton />
        <div style={{ marginTop: 'var(--s2)' }}>
          <Skeleton width="70%" />
        </div>
      </div>
    );
  }

  // Если произошла ошибка.
  if (error) {
    return (
      <div style={{ marginTop: 'var(--s5)' }}>
        <SectionHead title={t('overviewTitle')} />
        <ErrorNote error={error} fallback={t('overviewTitle')} />
      </div>
    );
  }

  // Если нет правил вообще.
  if (rules.length === 0) {
    return (
      <div style={{ marginTop: 'var(--s5)' }}>
        <EmptyState title={t('noRules')}>
          {t('noRulesLede')}
        </EmptyState>
      </div>
    );
  }

  // Проверяем, есть ли хотя бы одна сделка для проверки по любому правилу.
  const hasAnyData = rules.some((rule) => rule.followed + rule.violated + rule.unchecked > 0);

  // Если правила есть, но нет сделок для проверки.
  if (!hasAnyData) {
    return (
      <div style={{ marginTop: 'var(--s5)' }}>
        <SectionHead title={t('overviewTitle')} />
        <div className="state">
          <p className="muted">{t('noTradesInPeriod')}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 'var(--s5)' }}>
      <SectionHead title={t('overviewTitle')} />
      <Lookup one>
        {rules.map((rule) => {
          // Найти метрику для получения единицы измерения
          const metricDef = metrics.find((m) => m.key === rule.metric);
          const unitLabel = metricDef ? getUnitLabel(metricDef.unit, t) : '';

          const total = rule.followed + rule.violated;
          const hasData = total > 0;

          return (
            <KeyValue
              key={`${rule.metric}-${rule.operator}-${rule.threshold}`}
              label={
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s1)' }}>
                  <span>{getMetricLabel(rule.metric, t)}</span>
                  <span className="muted">
                    {getOperatorLabel(rule.operator, t)} {rule.threshold} {unitLabel}
                  </span>
                </div>
              }
              valueClassName={undefined}
              control
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--s2)' }}>
                {/* Доля соблюдения (если есть данные) */}
                {hasData && (
                  <div>
                    <span className="pos n">
                      {rule.followed} {t('followed', { followed: rule.followed, total })}
                    </span>
                  </div>
                )}

                {/* Число непроверенных — ВСЕГДА видно, ни при каких условиях */}
                {rule.unchecked > 0 && (
                  <div style={{ fontSize: '0.875rem' }}>
                    <span className="muted">
                      {t('unchecked', { count: rule.unchecked })}
                    </span>
                    <br />
                    <span className="foot" style={{ fontSize: '0.75rem' }}>
                      {t('uncheckedWhy')}
                    </span>
                  </div>
                )}
              </div>
            </KeyValue>
          );
        })}
      </Lookup>
    </div>
  );
}
