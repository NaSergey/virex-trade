'use client';

import { useTranslations } from 'next-intl';
import { useCompliance, useDeleteRule, useRules, useUpsertRule, type RuleRow } from '@/features/rules';
import { metricLabel, operatorLabel, unitLabel, compliancePct } from '@/features/rules/lib/metric-labels';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Lookup, KeyValue } from '@/shared/ui/Lookup';
import { Button } from '@/shared/ui/Button';

interface RulesListProps {
  /** Дни периода, за который считается соблюдение (из `usePeriodFilter().effectiveDays`). */
  days: number;
}

/**
 * Список объявленных правил: конфигурация и соблюдение за период — в одной
 * строке на правило.
 *
 * Раньше это были два раздела на двух разных страницах с разным набором
 * данных на одно и то же правило: тут — только факт (доля, непроверенные),
 * там — только конфигурация (порог, активность, удаление). Слияние убирает
 * дублирование, а не просто переносит оба списка рядом.
 */
export function RulesList({ days }: RulesListProps) {
  const t = useTranslations('rules');
  const { data: rulesData, isLoading: rulesLoading, error: rulesError } = useRules();
  const { data: complianceData, isLoading: complianceLoading, error: complianceError } = useCompliance(days);
  const upsert = useUpsertRule();
  const deleteRule = useDeleteRule();

  const metrics = rulesData?.metrics ?? [];
  const rules = rulesData?.rules ?? [];
  const complianceByMetric = new Map(complianceData?.rules.map((c) => [c.metric, c]));

  const isLoading = rulesLoading || complianceLoading;
  const error = rulesError ?? complianceError;

  const handleToggleActive = async (rule: RuleRow) => {
    try {
      await upsert.mutateAsync({
        metric: rule.metric,
        operator: rule.operator,
        threshold: rule.threshold,
        active: !rule.active,
      });
    } catch {
      // Ошибка показана через ErrorNote
    }
  };

  const handleDelete = (metric: string) => {
    void deleteRule.mutate(metric);
  };

  if (isLoading) {
    return (
      <div>
        <Skeleton />
        <div style={{ marginTop: 'var(--s2)' }}>
          <Skeleton width="70%" />
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorNote error={error} fallback={t('loadFailed')} />;
  }

  if (rules.length === 0) {
    return <EmptyState title={t('noRules')}>{t('noRulesLede')}</EmptyState>;
  }

  return (
    <div>
      <ErrorNote error={deleteRule.error} fallback={t('deleteFailed')} />
      <Lookup one>
        {rules.map((rule) => {
          const metricDef = metrics.find((m) => m.key === rule.metric);
          const isUnknown = !metricDef;
          const unitLabelStr = metricDef ? unitLabel(metricDef.unit, t) : '';

          const compliance = complianceByMetric.get(rule.metric);
          const followed = compliance?.followed ?? 0;
          const violated = compliance?.violated ?? 0;
          const unchecked = compliance?.unchecked ?? 0;
          const total = followed + violated;
          const hasData = total > 0;
          const pct = compliancePct(followed, total);

          const isDeleting = deleteRule.isPending && deleteRule.variables === rule.metric;

          return (
            <div key={rule.id} style={{ opacity: isUnknown ? 0.6 : 1 }}>
              <KeyValue
                label={
                  isUnknown ? (
                    t('unknownMetric')
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s1)' }}>
                      <span>{metricLabel(rule.metric, t)}</span>
                      <span className="muted">
                        {operatorLabel(rule.operator, t)} {rule.threshold} {unitLabelStr}
                      </span>
                    </div>
                  )
                }
                control
              >
                <div style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center' }}>
                  {!isUnknown && (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-end',
                          gap: 'var(--s1)',
                        }}
                      >
                        {rule.active && hasData && (
                          <span className="pos n">{t('followedPct', { pct, followed, total })}</span>
                        )}
                        {rule.active && !hasData && (
                          <span className="muted" style={{ fontSize: '0.875rem' }}>
                            {t('noTradesInPeriod')}
                          </span>
                        )}
                        {rule.active && unchecked > 0 && (
                          <span className="muted" style={{ fontSize: '0.75rem' }}>
                            {t('unchecked', { count: unchecked })}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="none"
                        tight
                        aria-pressed={rule.active}
                        disabled={isDeleting}
                        onClick={() => void handleToggleActive(rule)}
                      >
                        {rule.active ? '✓' : '◯'}
                      </Button>
                    </>
                  )}
                  <Button
                    variant="risk"
                    onClick={() => handleDelete(rule.metric)}
                    disabled={isDeleting}
                    style={{ fontSize: '0.875rem' }}
                  >
                    {t('remove')}
                  </Button>
                </div>
              </KeyValue>
            </div>
          );
        })}
      </Lookup>
    </div>
  );
}
