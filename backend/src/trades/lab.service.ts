import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EquityPoint, wilsonLower } from './trades.service';
import { isRangeTf, storedRangePos, type RangeTf } from './trade-context.service';
import { loadRows, SESSIONS, type Row } from './trade-rows';

// «Выборка»: произвольная комбинация фильтров по сделкам (теги + рыночный
// контекст из TradeContext + время) → сводка против базовой линии периода,
// кривая P&L и фасеты. Фасет = разбивка одного измерения, посчитанная при
// всех ОСТАЛЬНЫХ активных фильтрах (классический faceted search): видно,
// «что будет, если переключить это измерение», не сбрасывая остальное.

export interface LabFilter {
  days?: number; // 0/undefined = all time
  tzOffsetMin?: number; // client's Date.getTimezoneOffset() — weekday/hour buckets
  tagIds?: string[]; // contains-all
  direction?: 'long' | 'short';
  symbols?: string[];
  weekdays?: number[]; // 0..6 user-local, JS getDay() semantics
  hourFrom?: number; // 0..23 user-local, inclusive
  hourTo?: number; // 0..23 inclusive
  sessions?: string[]; // keys of SESSIONS
  trend4h?: string[]; // 'trend_up' | 'trend_down' | 'range'
  ema200?: 'above' | 'below';
  atr?: 'high' | 'low'; // vs median atrPct of the period
  vol?: 'high' | 'low'; // vs median volRel of the period
  rangeTf?: RangeTf; // which timeframe's entry range `range` reads (default 4h)
  range?: 'low' | 'mid' | 'high'; // where in that range the entry landed
}

export type { RangeTf } from './trade-context.service';

// Границы «низа» и «верха» диапазона входа. Вход вне диапазона ТФ (пробой)
// даёт rangePos < 0 / > 100 и естественно попадает в крайнюю корзину.
const RANGE_LOW_MAX = 33;
const RANGE_HIGH_MIN = 66;

function rangeBucket(v: number | null | undefined): string | null {
  if (v == null) return null;
  return v < RANGE_LOW_MAX ? 'low' : v < RANGE_HIGH_MIN ? 'mid' : 'high';
}

export interface LabAgg {
  trades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  winRate: number; // 0..100
  profitFactor: number;
  avgPnl: number;
  wilsonLow: number; // 0..100
}

type Dim =
  | 'direction'
  | 'session'
  | 'weekday'
  | 'hour'
  | 'trend4h'
  | 'ema200'
  | 'atr'
  | 'vol'
  | 'range'
  | 'symbol'
  | 'tags';

function agg(rows: Row[]): LabAgg {
  let wins = 0;
  let losses = 0;
  let totalPnl = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  for (const r of rows) {
    const pnl = r.closedPnl;
    totalPnl += pnl;
    if (pnl > 0) {
      wins++;
      grossProfit += pnl;
    } else if (pnl < 0) {
      losses++;
      grossLoss += pnl;
    }
  }
  const n = rows.length;
  return {
    trades: n,
    wins,
    losses,
    totalPnl: Number(totalPnl.toFixed(4)),
    winRate: n ? Number(((wins / n) * 100).toFixed(2)) : 0,
    profitFactor: grossLoss !== 0 ? Number((grossProfit / Math.abs(grossLoss)).toFixed(2)) : 0,
    avgPnl: n ? Number((totalPnl / n).toFixed(4)) : 0,
    wilsonLow: wilsonLower(wins, n),
  };
}

@Injectable()
export class LabService {
  constructor(private readonly prisma: PrismaService) {}

  async query(userId: string, f: LabFilter) {
    // Строки, сессии и медианы ATR/объёма — общие с «Ценой привычек», см.
    // trade-rows.ts. Медианы считаются по всему периоду: это стабильная точка
    // отсчёта для «выше/ниже среднего», не зависящая от остальных фильтров.
    const { rows, medAtr, medVol } = await loadRows(
      this.prisma,
      userId,
      f.days,
      f.tzOffsetMin,
    );
    const okRows = rows.filter((r) => r.ctx?.ok);

    // Диапазон входа считается сразу по всем ТФ, но фильтр и фасет всегда
    // читают только выбранный — иначе пять почти одинаковых рядов чипов.
    const tf = isRangeTf(f.rangeTf) ? f.rangeTf : '4h';
    const rangeOf = (r: Row): number | null => (r.ctx ? storedRangePos(r.ctx, tf) : null);

    // Предикаты по измерениям: true = сделка проходит фильтр этого измерения
    // (или фильтр не задан). Сделки без контекста не проходят контекстные
    // фильтры — честнее, чем молча считать их подходящими.
    const preds: Record<Dim, (r: Row) => boolean> = {
      direction: (r) => !f.direction || r.direction === f.direction,
      session: (r) => !f.sessions?.length || f.sessions.includes(r.session),
      weekday: (r) => !f.weekdays?.length || f.weekdays.includes(r.weekday),
      hour: (r) => {
        if (f.hourFrom == null && f.hourTo == null) return true;
        const from = f.hourFrom ?? 0;
        const to = f.hourTo ?? 23;
        // Диапазон через полночь (22 → 3) тоже валиден.
        return from <= to ? r.hour >= from && r.hour <= to : r.hour >= from || r.hour <= to;
      },
      trend4h: (r) =>
        !f.trend4h?.length || (r.ctx?.trend4h != null && f.trend4h.includes(r.ctx.trend4h)),
      ema200: (r) =>
        !f.ema200 ||
        (r.ctx?.ema200Above != null && r.ctx.ema200Above === (f.ema200 === 'above')),
      atr: (r) =>
        !f.atr ||
        (medAtr != null &&
          r.ctx?.atrPct != null &&
          (r.ctx.atrPct >= medAtr) === (f.atr === 'high')),
      vol: (r) =>
        !f.vol ||
        (medVol != null &&
          r.ctx?.volRel != null &&
          (r.ctx.volRel >= medVol) === (f.vol === 'high')),
      range: (r) => !f.range || rangeBucket(rangeOf(r)) === f.range,
      symbol: (r) => !f.symbols?.length || f.symbols.includes(r.symbol),
      tags: (r) => !f.tagIds?.length || f.tagIds.every((id) => r.tagSet.has(id)),
    };
    const allDims = Object.keys(preds) as Dim[];
    const passesAllExcept = (r: Row, skip?: Dim) =>
      allDims.every((d) => d === skip || preds[d](r));

    const filtered = rows.filter((r) => passesAllExcept(r));

    // Кривая накопленного P&L по выборке (lightweight-charts: строго
    // возрастающие уникальные времена).
    let cum = 0;
    let lastTime = 0;
    const equity: EquityPoint[] = filtered.map((r) => {
      cum += r.closedPnl;
      let time = Math.floor(r.closedAt.getTime() / 1000);
      if (time <= lastTime) time = lastTime + 1;
      lastTime = time;
      return { time, value: Number(cum.toFixed(4)) };
    });

    // Фасеты: значения измерения при всех остальных фильтрах.
    const facetOf = (dim: Dim, keyOf: (r: Row) => string | null, keys?: string[]) => {
      const subset = rows.filter((r) => passesAllExcept(r, dim));
      const groups = new Map<string, Row[]>();
      for (const r of subset) {
        const k = keyOf(r);
        if (k == null) continue;
        const g = groups.get(k);
        if (g) g.push(r);
        else groups.set(k, [r]);
      }
      const order = keys ?? [...groups.keys()];
      return order
        .filter((k) => groups.has(k))
        .map((k) => ({ key: k, ...agg(groups.get(k)!) }));
    };

    const facets: Array<{ dimension: string; values: Array<{ key: string } & LabAgg> }> = [
      { dimension: 'direction', values: facetOf('direction', (r) => r.direction, ['long', 'short']) },
      {
        dimension: 'session',
        values: facetOf('session', (r) => r.session, Object.keys(SESSIONS)),
      },
      {
        dimension: 'weekday',
        values: facetOf('weekday', (r) => String(r.weekday), ['1', '2', '3', '4', '5', '6', '0']),
      },
      {
        dimension: 'trend4h',
        values: facetOf('trend4h', (r) => r.ctx?.trend4h ?? null, ['trend_up', 'trend_down', 'range']),
      },
      {
        dimension: 'ema200',
        values: facetOf(
          'ema200',
          (r) => (r.ctx?.ema200Above == null ? null : r.ctx.ema200Above ? 'above' : 'below'),
          ['above', 'below'],
        ),
      },
      {
        dimension: 'atr',
        values: facetOf(
          'atr',
          (r) =>
            medAtr == null || r.ctx?.atrPct == null ? null : r.ctx.atrPct >= medAtr ? 'high' : 'low',
          ['high', 'low'],
        ),
      },
      {
        dimension: 'vol',
        values: facetOf(
          'vol',
          (r) =>
            medVol == null || r.ctx?.volRel == null ? null : r.ctx.volRel >= medVol ? 'high' : 'low',
          ['high', 'low'],
        ),
      },
      {
        dimension: 'range',
        values: facetOf('range', (r) => rangeBucket(rangeOf(r)), ['low', 'mid', 'high']),
      },
      {
        dimension: 'symbol',
        values: facetOf('symbol', (r) => r.symbol)
          .sort((a, b) => b.trades - a.trades)
          .slice(0, 12),
      },
    ];

    // Теговый фасет — при ВСЕХ фильтрах (включая уже выбранные теги): для
    // невыбранного тега это ответ «что будет, если добавить его сверху»,
    // для выбранного его числа совпадают с текущей выборкой.
    {
      const perTag = new Map<string, { name: string; color: string; rows: Row[] }>();
      for (const r of filtered) {
        for (const t of r.tags) {
          let b = perTag.get(t.id);
          if (!b) {
            b = { name: t.name, color: t.color, rows: [] };
            perTag.set(t.id, b);
          }
          b.rows.push(r);
        }
      }
      facets.push({
        dimension: 'tags',
        values: [...perTag.entries()]
          .map(([id, b]) => ({ key: id, name: b.name, color: b.color, ...agg(b.rows) }))
          .sort((a, b) => b.trades - a.trades),
      });
    }

    const latest = [...filtered].sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime());
    return {
      success: true,
      baseline: agg(rows),
      filtered: agg(filtered),
      equity,
      medians: { atrPct: medAtr, volRel: medVol },
      coverage: {
        total: rows.length,
        withContext: okRows.length,
        // Отдельно от withContext: диапазон входа считается по своим окнам и
        // на дневке требует месяца истории, поэтому у части сделок с полным
        // контекстом его всё равно нет — и панель должна честно это показать.
        withRange: rows.filter((r) => rangeOf(r) != null).length,
      },
      facets,
      trades: latest.slice(0, 200).map((r) => ({
        id: r.id,
        symbol: r.symbol,
        direction: r.direction,
        qty: r.qty,
        avgEntryPrice: r.avgEntryPrice,
        avgExitPrice: r.avgExitPrice,
        closedPnl: r.closedPnl,
        closedAt: r.closedAt,
        openedAt: r.openedAt,
        // Из скольких закрывающих ордеров собрана позиция — как в /api/trades.
        parts: r.parts,
        tags: r.tags,
        // Снимок рынка на входе — как в /api/trades: таблица подходящих сделок
        // показывает диапазон входа того ТФ, по которому идёт фильтрация, и без
        // контекста в строке эту колонку было бы нечем заполнить.
        context: r.ctx,
      })),
    };
  }
}
