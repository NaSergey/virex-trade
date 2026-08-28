'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { Field, Input, Select, FieldGroup } from '@/shared/ui/Field';
import { Seg } from '@/shared/ui/Seg';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { useRules, useUpsertRule } from '@/features/rules';
import { metricLabel } from '@/features/rules/lib/metric-labels';

/**
 * Форма объявления нового правила.
 *
 * Список метрик — те, на которых правила ещё нет: правило на метрику
 * существует не больше одного (`upsert` на бэкенде идёт по паре
 * userId+metric, см. `backend/src/rules/rules.service.ts`).
 */
export function AddRuleForm() {
  const t = useTranslations('rules');
  const { data } = useRules();
  const upsert = useUpsertRule();

  const metrics = data?.metrics ?? [];
  const rules = data?.rules ?? [];
  const usedMetricKeys = new Set(rules.map((r) => r.metric));
  const availableMetrics = metrics.filter((m) => !usedMetricKeys.has(m.key));

  const [selectedMetricKey, setSelectedMetricKey] = useState<string>('');
  const [operator, setOperator] = useState<'lte' | 'gte'>('lte');
  const [threshold, setThreshold] = useState<string>('');

  // Когда выбирают метрику, подставляют её умолчания — у метрик разный
  // масштаб (проценты депозита, разы плеча, штуки сделок), и пустое поле
  // заставило бы угадывать порядок величины до первого результата.
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
      await upsert.mutateAsync({ metric: selectedMetricKey, operator, threshold: thresholdNum });
      setSelectedMetricKey('');
      setOperator('lte');
      setThreshold('');
    } catch {
      // Ошибка показана через ErrorNote
    }
  };

  const ready = selectedMetricKey && threshold.trim() && !isNaN(Number(threshold));

  return (
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
              {metricLabel(m.key, t)}
            </option>
          ))}
        </Select>
      </Field>

      {selectedMetricKey && (
        <>
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

          <ErrorNote error={upsert.error} fallback={t('saveFailed')} />
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
  );
}
