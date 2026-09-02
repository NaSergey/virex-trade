'use client';

import { useTranslations } from 'next-intl';

/** Переводимые подписи и подсказки измерений «Выборки» — с переводом. */
export function useLabLabels() {
  const t = useTranslations('analytics');
  return {
    sessionLabels: {
      asia: t('sessionAsia'),
      london: t('sessionLondon'),
      ny: t('sessionNy'),
      night: t('sessionNight'),
    } as Record<string, string>,
    trendLabels: {
      trend_up: t('trendUp'),
      trend_down: t('trendDown'),
      range: t('trendRange'),
    } as Record<string, string>,
    emaLabels: {
      above: t('emaAbove'),
      below: t('emaBelow'),
    } as Record<string, string>,
    atrLabels: {
      high: t('atrHigh'),
      low: t('atrLow'),
    } as Record<string, string>,
    volLabels: {
      high: t('volHigh'),
      low: t('volLow'),
    } as Record<string, string>,
    /** Куда пришёлся вход по шкале диапазона ТФ: 0–33 / 33–66 / 66–100. */
    rangeLabels: {
      low: t('rangeLow'),
      mid: t('rangeMid'),
      high: t('rangeHigh'),
    } as Record<string, string>,
    rangeHints: {
      low: t('rangeHintLow'),
      mid: t('rangeHintMid'),
      high: t('rangeHintHigh'),
    } as Record<string, string>,
    rangeTfWindows: {
      '15m': t('rangeTfWindow15m'),
      '30m': t('rangeTfWindow30m'),
      '1h': t('rangeTfWindow1h'),
      '4h': t('rangeTfWindow4h'),
      '1d': t('rangeTfWindow1d'),
    } as Record<string, string>,
  };
}
