import {
  HORIZON_WEEKS,
  MAX_BEST_WEEK_SHARE,
  MAX_DRAWDOWN,
  MIN_MOVING_WEEKS,
  MIN_UP_SHARE,
  MIN_WEEKS,
  MIN_WEEKLY_T,
} from './criteria';
import type { Point, Portfolio } from './hl-types';

const DAY = 86_400_000;
const WEEK = 7 * DAY;
/** Неделя «сдвинулась», если кривая ушла больше чем на цент. */
const EPS = 0.01;

/** Точки [время, значение] по возрастанию времени. */
export type Series = [number, number][];

/** Код причины отказа; текст с числами собирает фронт. */
export type RejectReason =
  | 'noData'
  | 'history'
  | 'trading'
  | 'pnlAllTime'
  | 'pnlHorizon'
  | 'pnl90'
  | 'pnlMonth'
  | 'weeksUp'
  | 'oneSpike'
  | 'drawdown'
  | 'luck'
  | 'bot';

export interface WalletStats {
  accountValue: number;
  pnlWeek: number;
  pnlMonth: number;
  pnl90: number;
  pnlAllTime: number;
  roiMonth: number | null;
  weeks: number;
  weeksMoving: number;
  weeksUp: number;
  bestWeekShare: number | null;
  maxDrawdown: number;
  /** t-статистика недельной доходности: насколько плюс отличим от везения. null — не из чего считать. */
  weeklyT: number | null;
}

/**
 * t-статистика среднего недельной доходности: `среднее / (σ / √n)`. Отвечает на
 * вопрос «а не везение ли это»: при нулевом мастерстве она колеблется около нуля,
 * и t ≥ 2 — примерно один шанс из сорока. Честная оговорка: она выше у ровных
 * стратегий (мейкер, carry) и ниже у рывковых — направленному трейдеру с редкими
 * крупными неделями выйти за порог труднее. Нулевой разброс (все недели одинаковы)
 * или меньше 3 недель — `null`: судить не по чему.
 */
export function weeklyTStat(returns: number[]): number | null {
  const n = returns.length;
  if (n < 3) return null;
  const mean = returns.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(
    returns.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1),
  );
  return sd > 0 ? mean / (sd / Math.sqrt(n)) : null;
}

export function toSeries(points: Point[] | undefined): Series {
  return (points ?? [])
    .map(([t, v]) => [Number(t), Number(v)] as [number, number])
    .filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v))
    .sort((a, b) => a[0] - b[0]);
}

/**
 * Значение в момент t — последняя точка не позже t. Ступенькой, без
 * интерполяции: у старой истории Hyperliquid шаг до ~10 дней, и прямая между
 * точками раскрасила бы недели без единой точки ровным ростом — стабильность
 * вышла бы выдуманной.
 */
export function valueAt(s: Series, t: number): number | null {
  let lo = 0;
  let hi = s.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s[mid][0] <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found < 0 ? null : s[found][1];
}

/**
 * Старая история редкая, последний месяц — с шагом ~8 ч: берём точки всей
 * истории до начала месяца и месяц целиком. Окна PnL у Hyperliquid начинаются
 * с нуля, поэтому месяц встаёт на уровень всей истории в точке стыка
 * (`offset`); баланс — абсолютная величина, его не сдвигают.
 */
export function stitch(all: Series, recent: Series, offset: boolean): Series {
  if (recent.length === 0) return all;
  const [t0, v0] = recent[0];
  const shift = offset ? (valueAt(all, t0) ?? v0) - v0 : 0;
  return [
    ...all.filter(([t]) => t < t0),
    ...recent.map(([t, v]) => [t, v + shift] as [number, number]),
  ];
}

/**
 * Стабилен ли кошелёк — по кривой перп-PnL, а не по сделкам (решение владельца:
 * смотрим на прибыль и убыток). Окна перповые, потому что общие включают
 * переоценку спотовых монет: держатель HYPE уходит на сотни миллионов в минус и
 * обратно, не торгуя. Баланс — общий: перп-счёт у многих почти пуст, деньги
 * лежат в споте, и просадка от него выходила в тысячи процентов.
 */
export function analyzePortfolio(
  pf: Portfolio,
  now: number,
): { stats: WalletStats; reason: RejectReason | null } {
  const w = new Map(Array.isArray(pf) ? pf : []);
  const pnl = stitch(
    toSeries(w.get('perpAllTime')?.pnlHistory),
    toSeries(w.get('perpMonth')?.pnlHistory),
    true,
  );
  const av = stitch(
    toSeries(w.get('allTime')?.accountValueHistory),
    toSeries(w.get('month')?.accountValueHistory),
    false,
  );

  const accountValue = av.length ? av[av.length - 1][1] : 0;
  if (pnl.length < 2) {
    return {
      stats: {
        accountValue,
        pnlWeek: 0,
        pnlMonth: 0,
        pnl90: 0,
        pnlAllTime: 0,
        roiMonth: null,
        weeks: 0,
        weeksMoving: 0,
        weeksUp: 0,
        bestWeekShare: null,
        maxDrawdown: 0,
        weeklyT: null,
      },
      reason: 'noData',
    };
  }

  const first = pnl[0][0];
  const startValue = pnl[0][1];
  const last = pnl[pnl.length - 1][1];
  const at = (t: number) => valueAt(pnl, t) ?? startValue;
  /** Прибыль от момента `from` до конца; история короче окна — вся история. */
  const since = (from: number) => last - at(from);

  // Недели — от «сейчас» назад, только целиком внутри истории.
  const weekly: number[] = [];
  const weeklyReturns: number[] = [];
  for (let k = 0; k < HORIZON_WEEKS; k++) {
    const end = now - k * WEEK;
    const begin = end - WEEK;
    if (begin < first) break;
    const pnlWeek = at(end) - at(begin);
    weekly.push(pnlWeek);
    // Доходность недели — к балансу на её начало: $500 на счёте в $5k и в $500k —
    // разные результаты, и t по долларам сравнивала бы размеры счетов.
    const base = valueAt(av, begin) ?? av[0]?.[1] ?? 0;
    if (base > 0) weeklyReturns.push(pnlWeek / base);
  }
  const moving = weekly.filter((x) => Math.abs(x) > EPS);
  const weeksUp = moving.filter((x) => x > EPS).length;
  const horizonPnl = weekly.reduce((s, x) => s + x, 0);
  const bestWeekShare =
    horizonPnl > 0 ? Math.max(0, ...weekly) / horizonPnl : null;

  // Просадка — от пика кривой к балансу в момент пика: падение считается от
  // того, что было на кону тогда, а не от сегодняшнего баланса после депозитов.
  const h0 = weekly.length ? now - weekly.length * WEEK : first;
  let peak = at(h0);
  let peakAv = valueAt(av, h0) ?? av[0]?.[1] ?? 0;
  let maxDrawdown = 0;
  for (const [t, v] of pnl) {
    if (t < h0) continue;
    if (v > peak) {
      peak = v;
      peakAv = valueAt(av, t) ?? peakAv;
    } else if (peakAv > 0) {
      maxDrawdown = Math.max(maxDrawdown, (peak - v) / peakAv);
    }
  }

  // ROI — к среднему балансу за месяц, а не к балансу на начало окна: депозит
  // посреди месяца не делает ROI тысячей процентов.
  const monthAgo = now - 30 * DAY;
  const monthAv = av.filter(([t]) => t >= monthAgo).map(([, v]) => v);
  const avgAv = monthAv.length
    ? monthAv.reduce((s, v) => s + v, 0) / monthAv.length
    : (valueAt(av, now) ?? 0);
  const pnlMonth = since(monthAgo);

  const stats: WalletStats = {
    accountValue,
    pnlWeek: since(now - 7 * DAY),
    pnlMonth,
    pnl90: since(now - 90 * DAY),
    pnlAllTime: last - startValue,
    roiMonth: avgAv > 0 ? pnlMonth / avgAv : null,
    weeks: weekly.length,
    weeksMoving: moving.length,
    weeksUp,
    bestWeekShare,
    maxDrawdown,
    weeklyT: weeklyTStat(weeklyReturns),
  };

  return { stats, reason: verdict(stats, horizonPnl) };
}

/** Первая не пройденная проверка — от «данных мало» к «торгует плохо». */
function verdict(s: WalletStats, horizonPnl: number): RejectReason | null {
  if (s.weeks < MIN_WEEKS) return 'history';
  if (s.weeksMoving < MIN_MOVING_WEEKS) return 'trading';
  if (s.pnlAllTime <= 0) return 'pnlAllTime';
  if (horizonPnl <= 0) return 'pnlHorizon';
  if (s.pnl90 <= 0) return 'pnl90';
  if (s.pnlMonth <= 0) return 'pnlMonth';
  if (s.weeksUp / s.weeksMoving < MIN_UP_SHARE) return 'weeksUp';
  if ((s.bestWeekShare ?? 1) > MAX_BEST_WEEK_SHARE) return 'oneSpike';
  if (s.maxDrawdown > MAX_DRAWDOWN) return 'drawdown';
  if (s.weeklyT != null && s.weeklyT < MIN_WEEKLY_T) return 'luck';
  return null;
}
