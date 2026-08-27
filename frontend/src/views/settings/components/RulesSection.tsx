'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { Field, Input, Select, FieldGroup } from '@/shared/ui/Field';
import { Seg } from '@/shared/ui/Seg';
import { SectionHead } from '@/shared/ui/SectionHead';
import { KeyValue, Lookup } from '@/shared/ui/Lookup';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  useRules,
  useUpsertRule,
  useDeleteRule,
  type MetricDef,
  type RuleRow,
} from '@/features/rules/api/hooks';

/** Маппирование ключей метрик на ключи локализации */
function getMetricLabel(
  metricKey: string,
  t: (key: string) => string,
): string {
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
 * Секция объявления числовых правил в настройках.
 *
 * Пользователь объявляет правило (например, «номинал позиции не больше 200%»),
 * и сервис показывает, насколько получается его соблюдать по фактическим сделкам.
 */
export const RulesSection = () => {
  const t = useTranslations('rules');
  const { data, isLoading, error, isFetching } = useRules();
  const upsert = useUpsertRule();
  const deleteRule = useDeleteRule();

  const metrics = data?.metrics ?? [];
  const rules = data?.rules ?? [];

  // Метрики, на которых уже есть правила
  const usedMetricKeys = new Set(rules.map((r) => r.metric));
  // Метрики, доступные для добавления (те, на которых правил нет)
  const availableMetrics = metrics.filter((m) => !usedMetricKeys.has(m.key));

  const [selectedMetricKey, setSelectedMetricKey] = useState<string>('');
  const [operator, setOperator] = useState<'lte' | 'gte'>('lte');
  const [threshold, setThreshold] = useState<string>('');

  // Когда выбирают метрику, подставляют её умолчания
  const handleMetricChange = (metricKey: string) => {
    setSelectedMetricKey(metricKey);
    const metric = metrics.find((m) => m.key === metricKey);
    if (metric) {
      setOperator(metric.defaultOperator);
      setThreshold(String(metric.defaultThreshold));
    }
  };

  const handleSave = async () => {
    if (!selectedMetricKey || !threshold.trim()) return;
    const thresholdNum = Number(threshold);
    if (isNaN(thresholdNum)) return;

    try {
      await upsert.mutateAsync({
        metric: selectedMetricKey,
        operator,
        threshold: thresholdNum,
      });
      // Очистить форму после успеха
      setSelectedMetricKey('');
      setOperator('lte');
      setThreshold('');
    } catch {
      // Ошибка показана через ErrorNote
    }
  };

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

  const ready = selectedMetricKey && threshold.trim() && !isNaN(Number(threshold));

  if (isLoading) {
    return (
      <div className="set">
        <SectionHead title={t('settingsTitle')} />
        <Skeleton />
        <div style={{ marginTop: 'var(--s2)' }}>
          <Skeleton width="70%" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="set">
        <SectionHead title={t('settingsTitle')} />
        <ErrorNote error={error} fallback={t('settingsTitle')} />
      </div>
    );
  }

  return (
    <div className="set">
      <SectionHead title={t('settingsTitle')} />
      <p className="muted">{t('settingsLede')}</p>

      {/* Форма добавления правила */}
      <div style={{ marginTop: 'var(--s4)' }}>
        <h3>{t('add')}</h3>

        <Field label={t('metricLabel')} htmlFor="rule-metric-select">
          <Select
            id="rule-metric-select"
            full
            value={selectedMetricKey}
            onChange={(e) => handleMetricChange(e.target.value)}
          >
            <option value="">{t('metricLabel')}</option>
            {availableMetrics.map((m) => (
              <option key={m.key} value={m.key}>
                {getMetricLabel(m.key, t)}
              </option>
            ))}
          </Select>
        </Field>

        {selectedMetricKey && (
          <>
            {/* Порог подставляется из каталога, а не остаётся пустым: у метрик
                разный масштаб (проценты депозита, разы плеча, штуки сделок), и
                пустое поле заставило бы человека угадывать порядок величины до
                первого результата. */}
            <FieldGroup label={t('operatorLabel')}>
              <Seg
                options={[
                  { value: 'lte', label: t('opLte') },
                  { value: 'gte', label: t('opGte') },
                ]}
                value={operator}
                onChange={(op) => setOperator(op)}
                ariaLabel={t('operatorLabel')}
              />
            </FieldGroup>

            <Field label={t('thresholdLabel')} htmlFor="rule-threshold">
              <div style={{ display: 'flex', gap: 'var(--s1)' }}>
                <Input
                  id="rule-threshold"
                  full
                  type="number"
                  step="any"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder={t('thresholdLabel')}
                />
                <span className="muted" style={{ whiteSpace: 'nowrap', lineHeight: '2.4rem' }}>
                  {metrics.find((m) => m.key === selectedMetricKey)?.unit}
                </span>
              </div>
            </Field>

            <ErrorNote error={upsert.error} fallback={t('settingsTitle')} />
            <Button
              variant="solid"
              style={{ marginTop: 'var(--s3)' }}
              disabled={upsert.isPending || !ready}
              onClick={() => void handleSave()}
            >
              {upsert.isPending ? t('saving') : t('save')}
            </Button>
          </>
        )}
      </div>

      {/* Список объявленных правил */}
      {rules.length > 0 ? (
        <div style={{ marginTop: 'var(--s4)' }}>
          <h3>{t('overviewTitle')}</h3>
          <ErrorNote error={deleteRule.error} fallback={t('settingsTitle')} />
          <Lookup one>
            {rules.map((rule) => {
              const metricDef = metrics.find((m) => m.key === rule.metric);
              const isUnknown = !metricDef;
              // Блокируем только конкретное правило, которое удаляется сейчас
              const isDeleting = deleteRule.isPending && deleteRule.variables === rule.metric;
              const isDisabled = isUnknown;

              return (
                <div
                  key={rule.id}
                  style={{
                    opacity: isUnknown ? 0.6 : 1,
                  }}
                >
                  <KeyValue
                    label={
                      isUnknown
                        ? t('unknownMetric')
                        : getMetricLabel(rule.metric, t)
                    }
                    control
                  >
                    <div style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center' }}>
                      {!isUnknown && (
                        <>
                          <span>{t(rule.operator === 'lte' ? 'opLte' : 'opGte')}</span>
                          <span>
                            {rule.threshold} {metricDef?.unit}
                          </span>
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
                        disabled={isDeleting || isDisabled}
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
      ) : (
        <div style={{ marginTop: 'var(--s4)' }}>
          <EmptyState
            title={t('noRules')}
          >
            {t('noRulesLede')}
          </EmptyState>
        </div>
      )}
    </div>
  );
};
