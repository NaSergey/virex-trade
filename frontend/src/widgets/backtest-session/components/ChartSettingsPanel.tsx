'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Slider } from '@/shared/ui/Slider';
import { DEFAULT_MAX_RISK } from '../model/useRiskSettings';
import { RANGES_ENABLED } from '../model/useChartSettings';

/** Проценты без хвоста: 10%, 2.5%. */
const fmtRisk = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}%`;

/**
 * Настройки графика — правая панель на месте панели ордера, как сетка фиксации:
 * шестерёнка над графиком переключает её. Индикаторы и верхняя граница риска —
 * всё, что меняет терминал на этом устройстве.
 *
 * Значения пишутся сразу, без «Сохранить», как и сам переключатель RSI.
 */
export function ChartSettingsPanel({
  rsiOn,
  onRsi,
  rangesOn,
  onRanges,
  maxRisk,
  onMaxRisk,
  onClose,
}: {
  rsiOn: boolean;
  onRsi: (on: boolean) => void;
  rangesOn: boolean;
  onRanges: (on: boolean) => void;
  maxRisk: number;
  onMaxRisk: (value: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations('backtest');
  const tc = useTranslations('common');
  const risky = maxRisk > DEFAULT_MAX_RISK;

  return (
    <div className="order-panel cg-panel">
      <SectionHead title={t('chartSettings')} className="cg-head" />

      {/* Весь ряд — переключатель: включённый индикатор подсвечен по всей своей площади. */}
      <Button
        variant="none"
        className="cs-indicator"
        aria-pressed={rsiOn}
        onClick={() => onRsi(!rsiOn)}
      >
        {t('indicatorRsi')}
      </Button>
      {RANGES_ENABLED && (
        <Button variant="none" className="cs-indicator" aria-pressed={rangesOn} onClick={() => onRanges(!rangesOn)}>
          {t('indicatorRanges')}
        </Button>
      )}

      <Field
        label={
          <span className="fld-head">
            <span>{t('riskSettingsMax')}</span>
            {/* Ширина по самому широкому значению — иначе подпись и ползунок сдвигались бы при каждой цифре. */}
            <span className="risk-val">{fmtRisk(maxRisk)}</span>
          </span>
        }
      >
        {() => <Slider value={maxRisk} min={0} max={100} step={1} onChange={onMaxRisk} aria-label={t('riskSettingsMax')} />}
      </Field>
      <p className="muted">{t('riskSettingsDefault', { value: DEFAULT_MAX_RISK })}</p>
      {risky && <p className="neg">{t('riskSettingsDanger', { value: DEFAULT_MAX_RISK })}</p>}

      <div className="order-actions">
        {maxRisk !== DEFAULT_MAX_RISK && (
          <Button variant="bare" onClick={() => onMaxRisk(DEFAULT_MAX_RISK)}>
            {t('riskSettingsReset', { value: DEFAULT_MAX_RISK })}
          </Button>
        )}
        <Button variant="bare" onClick={onClose}>
          {tc('back')}
        </Button>
      </div>
    </div>
  );
}
