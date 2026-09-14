/**
 * Параметры сгенерированного рынка. Стартовые значения — первое приближение;
 * подбираются по таблице `src/scripts/synthetic-market-preview.ts`, а не на глаз.
 */
import { DAY_MS, FUTURE_AFTER_MS, MINUTE_MS } from '../backtest-math';

/**
 * Версия генератора. Поднимается при ЛЮБОЙ правке, меняющей путь цены:
 * незавершённая сессия иначе молча получила бы другой график под открытыми сделками.
 */
export const SYNTH_VERSION = 1;

export { DAY_MS, MINUTE_MS };
export const MINUTES_PER_DAY = 1440;

/** Начало оси — понедельник, полночь UTC. Даты вымышленные, день недели и час — настоящие. */
export const SYNTH_EPOCH = Date.UTC(2000, 0, 3);
/** История до старта: год пана назад (HISTORY_CAP_MS на фронте) и сутки на недоформированную дневку. */
export const HISTORY_DAYS = 366;
/** Сессия идёт вперёд столько же, сколько реальной гарантировано истории после старта. */
export const SESSION_MS = FUTURE_AFTER_MS;

/** Якорь цены сессии — логравномерно в этих границах. */
export const ANCHOR_PRICE_MIN = 25_000;
export const ANCHOR_PRICE_MAX = 110_000;
/** Полураспад возврата к якорю: год блуждания не уводит цену в 3 тысячи или в полмиллиона. */
export const ANCHOR_HALF_LIFE_MIN = 120 * MINUTES_PER_DAY;

/** Базовая суточная волатильность (доля). */
export const BASE_DAILY_VOL = 0.018;
/** Разброс логарифма волатильности в устойчивом состоянии и её память. */
export const LOG_VOL_SD = 0.45;
export const LOG_VOL_MEMORY_MIN = MINUTES_PER_DAY;
/** Логарифм волатильности не уходит от среднего дальше этого. */
export const LOG_VOL_BAND = 1.5;
/**
 * Минута с шумом больше SHOCK_Z сигм поднимает волатильность на SHOCK_KICK.
 * Толчки копятся: при памяти в сутки средний сдвиг логарифма волатильности —
 * «толчков в сутки × SHOCK_KICK», поэтому порог высокий, а толчок малый.
 */
export const SHOCK_Z = 5;
export const SHOCK_KICK = 0.1;
/** Потолок шума минуты в сигмах: t(4) изредка даёт абсурдные 50σ. */
export const NOISE_CLAMP = 8;
/** Выходные тише будней во столько раз. */
export const WEEKEND_VOL = 0.7;
/** Внутридневной ритм: прибавка на пике (14:30 UTC) и провал в азиатскую ночь (05:00 UTC). */
export const HOUR_PEAK = 0.55;
export const HOUR_TROUGH = 0.35;

export const DURATION_SPREAD = 0.5;
export const MIN_DURATION_MIN = 20;

export const REGIME = {
  trend: { medianH: 36, volMult: 1.1 },
  range: { medianH: 48, volMult: 0.85 },
  squeeze: { medianH: 18, volMult: 0.45 },
} as const;

/** Вероятности выхода из режима; остаток до 1 у тренда — разворот. */
export const FROM_TREND = { range: 0.55, squeeze: 0.25 };
export const FROM_RANGE = { trend: 0.6 };
/** Выход из сжатия толкает волатильность — расширение после сжатия. */
export const SQUEEZE_EXIT_KICK = 0.5;

/** Импульс тренда: снос в базовых минутных волатильностях. */
export const IMPULSE = { medianH: 6, kappaMin: 0.035, kappaMax: 0.08 };
/** Откат: доля сноса импульса против направления. */
export const PULLBACK = { medianH: 3, shareMin: 0.5, shareMax: 0.9, volMult: 0.8 };

/** Полуширина коридора — в суточных волатильностях. */
export const RANGE_WIDTH = { min: 0.8, max: 1.5 };
export const RANGE_PULL_HALF_LIFE_MIN = 1440;
export const RANGE_EDGE_HALF_LIFE_MIN = 30;
export const SQUEEZE_PULL_HALF_LIFE_MIN = 360;
/** Дальше этой доли полуширины от центра выход из коридора идёт в сторону этого края. */
export const BREAKOUT_SIDE = 0.5;

export const MAX_LEVELS = 8;
/** Зона уровня — в суточных волатильностях. */
export const LEVEL_ZONE = 0.15;
/** Вероятность, что импульс кончится на уровне, к которому подошёл. */
export const LEVEL_REACT_P = 0.45;
/** Вынос — длинная тень без закрытия: базовая вероятность на минуту и множитель у уровня. */
export const SWEEP_P = 0.0015;
export const SWEEP_NEAR_LEVEL = 4;
export const SWEEP_SIGMAS = { min: 3, max: 8 };
