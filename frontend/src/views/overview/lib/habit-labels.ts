import type { Habit } from '@/entities/trade';

export type TFunc = (key: string, values?: Record<string, string | number>) => string;

const pad2 = (n: number) => String(n).padStart(2, '0');

const DIR_LABEL_KEYS: Record<string, string> = { long: 'habitLabelDirLong', short: 'habitLabelDirShort' };
const DIR_ADVICE_KEYS: Record<string, string> = { long: 'habitAdviceDirLong', short: 'habitAdviceDirShort' };
const WEEKDAY_LABEL_KEYS = [
  'habitLabelWeekday0',
  'habitLabelWeekday1',
  'habitLabelWeekday2',
  'habitLabelWeekday3',
  'habitLabelWeekday4',
  'habitLabelWeekday5',
  'habitLabelWeekday6',
];
const SESSION_LABEL_KEYS: Record<string, string> = {
  asia: 'habitLabelSessionAsia',
  london: 'habitLabelSessionLondon',
  ny: 'habitLabelSessionNy',
  night: 'habitLabelSessionNight',
};
const TREND_LABEL_KEYS: Record<string, string> = {
  trend_up: 'habitLabelTrendUp',
  trend_down: 'habitLabelTrendDown',
  range: 'habitLabelTrendRange',
};
const EMA200_LABEL_KEYS: Record<string, string> = { above: 'habitLabelEma200Above', below: 'habitLabelEma200Below' };
const ATR_LABEL_KEYS: Record<string, string> = { high: 'habitLabelAtrHigh', low: 'habitLabelAtrLow' };
const ATR_ADVICE_KEYS: Record<string, string> = { high: 'habitAdviceAtrHigh', low: 'habitAdviceAtrLow' };
const VOL_LABEL_KEYS: Record<string, string> = { high: 'habitLabelVolHigh', low: 'habitLabelVolLow' };
const VOL_ADVICE_KEYS: Record<string, string> = { high: 'habitAdviceVolHigh', low: 'habitAdviceVolLow' };
const RANGE_LABEL_KEYS: Record<string, string> = {
  low: 'habitLabelRange4hLow',
  mid: 'habitLabelRange4hMid',
  high: 'habitLabelRange4hHigh',
};

/**
 * Подпись привычки на языке интерфейса. Незнакомый `kind` (новый бэкенд
 * поверх старого фронта или наоборот) откатывается на сырой `label` с
 * бэкенда напрямую, БЕЗ похода в `t()` — это уже готовый текст, а не ключ
 * перевода. Тот же принцип, что был в удалённом `metric-labels.ts`: лучше
 * нелокализованная строка, чем пустое место.
 */
export function habitLabel(h: Habit, t: TFunc): string {
  const p = h.params;
  switch (h.kind) {
    case 'tilt':
      return t('habitLabelTilt');
    case 'overtrading':
      return t('habitLabelOvertrading', { nth: p.nth });
    case 'size_up':
      return t('habitLabelSizeUp', { mult: p.mult });
    case 'size_up_after_loss':
      return t('habitLabelSizeUpAfterLoss');
    case 'hold_long':
      return t('habitLabelHoldLong');
    case 'dir': {
      const key = DIR_LABEL_KEYS[String(p.direction)];
      return key ? t(key) : h.label;
    }
    case 'hour':
      return t('habitLabelHour', { hourFrom: pad2(Number(p.hourFrom)), hourTo: pad2(Number(p.hourTo)) });
    case 'weekday': {
      const key = WEEKDAY_LABEL_KEYS[Number(p.weekday)];
      return key ? t(key) : h.label;
    }
    case 'session': {
      const key = SESSION_LABEL_KEYS[String(p.session)];
      return key ? t(key) : h.label;
    }
    case 'trend4h': {
      const key = TREND_LABEL_KEYS[String(p.trend)];
      return key ? t(key) : h.label;
    }
    case 'ema200': {
      const key = EMA200_LABEL_KEYS[String(p.side)];
      return key ? t(key) : h.label;
    }
    case 'atr': {
      const key = ATR_LABEL_KEYS[String(p.level)];
      return key ? t(key) : h.label;
    }
    case 'vol': {
      const key = VOL_LABEL_KEYS[String(p.level)];
      return key ? t(key) : h.label;
    }
    case 'range4h': {
      const key = RANGE_LABEL_KEYS[String(p.bucket)];
      return key ? t(key) : h.label;
    }
    case 'tag':
      return t('habitLabelTag', { tagName: String(p.tagName) });
    case 'symbol':
      return t('habitLabelSymbol', { symbol: String(p.symbol) });
    default:
      return h.label;
  }
}

/** Совет привычки — тот же принцип отката, что у `habitLabel`. */
export function habitAdvice(h: Habit, t: TFunc): string {
  const p = h.params;
  switch (h.kind) {
    case 'tilt':
      return t('habitAdviceTilt');
    case 'overtrading':
      return t('habitAdviceOvertrading', { limit: p.limit });
    case 'size_up':
      return t('habitAdviceSizeUp');
    case 'size_up_after_loss':
      return t('habitAdviceSizeUpAfterLoss');
    case 'hold_long':
      return t('habitAdviceHoldLong');
    case 'dir': {
      const key = DIR_ADVICE_KEYS[String(p.direction)];
      return key ? t(key) : h.advice;
    }
    case 'hour':
      return t('habitAdviceHour');
    case 'weekday':
      return t('habitAdviceWeekday');
    case 'session':
      return t('habitAdviceSession');
    case 'trend4h':
      return t('habitAdviceTrend4h');
    case 'ema200':
      return t('habitAdviceEma200');
    case 'atr': {
      const key = ATR_ADVICE_KEYS[String(p.level)];
      return key ? t(key) : h.advice;
    }
    case 'vol': {
      const key = VOL_ADVICE_KEYS[String(p.level)];
      return key ? t(key) : h.advice;
    }
    case 'range4h':
      return t('habitAdviceRange4h');
    case 'tag':
      return t('habitAdviceTag');
    case 'symbol':
      return t('habitAdviceSymbol');
    default:
      return h.advice;
  }
}

/**
 * Ссылка-дрилдаун в Аналитику: `lab` уже несёт query-параметры с теми же
 * именами, которых ждёт `useLab` (см. views/analytics/api/hooks.ts) — здесь
 * достаточно сериализовать словарь как есть. `null` — у поведенческих
 * привычек (tilt/overtrading/size_up/size_up_after_loss/hold_long), для них
 * строка на Обзоре не кликабельна: там нет измерения «Аналитики», в которое
 * можно провалиться.
 */
export function habitSearchParams(lab: Record<string, string> | null): string | null {
  if (!lab) return null;
  return new URLSearchParams(lab).toString();
}
