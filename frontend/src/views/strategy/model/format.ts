import { dateFormat } from '@/shared/lib/utils/intl';
import type { FeatureKey, Outcome, Rule } from '../api/types';

const R2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const N0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const N1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pctFormat = new Map<number, Intl.NumberFormat>();

const ok = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);

/** R со знаком: «+0,35R», «−1,00R». */
export const fmtR = (x: number | null | undefined): string =>
  ok(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${R2.format(Math.abs(x))}R` : '—';

/** Доля в процентах: 0,412 → «41,2 %». */
export function fmtPct(x: number | null | undefined, digits = 1): string {
  if (!ok(x)) return '—';
  let f = pctFormat.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    pctFormat.set(digits, f);
  }
  return `${f.format(x * 100)} %`;
}

export const fmtNum = (x: number | null | undefined): string => (ok(x) ? R2.format(x) : '—');
export const fmtInt = (x: number | null | undefined): string => (ok(x) ? N0.format(x) : '—');
export const fmtPrice = (x: number): string => N1.format(x);
export const fmtUsd = (x: number): string => `${x < 0 ? '−' : ''}$${N0.format(Math.abs(x))}`;

export const fmtDate = (ms: number): string =>
  dateFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(ms));

export const fmtDateTime = (ms: number): string =>
  dateFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(ms));

/** Секунды → «36:54» — таймкод видео. */
export const clock = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export const tone = (x: number | null | undefined): 'pos' | 'neg' | undefined =>
  ok(x) && x > 0 ? 'pos' : ok(x) && x < 0 ? 'neg' : undefined;

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  session: 'Сессия',
  weekend: 'День',
  daily: 'Дневная структура',
  vol: 'Волатильность',
  stopAtr: 'Стоп',
  plannedR: 'Плановый R',
  pierce: 'Прокол свипа',
  deep: 'Глубокий дисконт',
};

const VALUE_LABELS: Record<string, string> = {
  'session:asia': 'Азия',
  'session:london': 'Лондон',
  'session:ny': 'Нью-Йорк',
  'session:night': 'ночь',
  'weekend:yes': 'выходные',
  'weekend:no': 'будни',
  'daily:with': 'по ходу сделки',
  'daily:against': 'против сделки',
  'vol:low': 'низкая',
  'vol:mid': 'средняя',
  'vol:high': 'высокая',
  'stopAtr:<0.5': '< 0,5 ATR',
  'stopAtr:0.5-1.5': '0,5–1,5 ATR',
  'stopAtr:>1.5': '> 1,5 ATR',
  'plannedR:1-2': '1–2R',
  'plannedR:2-3': '2–3R',
  'plannedR:>3': '> 3R',
  'pierce:<0.25': '< 0,25 ATR',
  'pierce:>=0.25': '≥ 0,25 ATR',
  'deep:yes': 'да',
  'deep:no': 'нет',
};

export const valueText = (feature: FeatureKey, value: string): string =>
  VALUE_LABELS[`${feature}:${value}`] ?? value;

export const ruleText = (r: Rule): string => `${FEATURE_LABELS[r.feature]}: ${valueText(r.feature, r.value)}`;

export const OUTCOME_LABELS: Record<Outcome, string> = { target: 'цель', stop: 'стоп', time: 'срок' };
