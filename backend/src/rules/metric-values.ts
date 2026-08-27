/**
 * Значения метрик — отдельно от проверки порогов.
 *
 * Значение не зависит ни от одного правила: «экспозиция этой сделки 30%» —
 * факт, а «30% нарушает ваш порог 20%» — суждение. Смешав их, пришлось бы
 * пересчитывать факты при каждой правке порога.
 */

export interface TradeRow {
  id: string;
  closedAt: Date;
  closedPnl: number;
  leverage: number | null;
  risk: {
    exposurePct: number | null;
    plannedRiskPct: number | null;
    ok: boolean;
    balanceAtEntry: number | null;
  } | null;
}

/** subjectId — Trade.id для окна сделки, YYYY-MM-DD для окна суток. */
export interface MetricValue {
  subjectId: string;
  value: number | null;
}

/**
 * Календарные сутки в зоне пользователя.
 *
 * tzOffsetMin приходит с фронта из getTimezoneOffset(), где знак обратный
 * привычному: для UTC+3 это -180. Отсюда вычитание, а не прибавление.
 */
export function localDayKey(at: Date, tzOffsetMin: number): string {
  return new Date(at.getTime() - tzOffsetMin * 60_000).toISOString().slice(0, 10);
}

/** Метрика риска доступна, только когда она посчитана и помечена как годная. */
function riskValue(row: TradeRow, pick: 'exposurePct' | 'plannedRiskPct'): number | null {
  if (!row.risk || !row.risk.ok) return null;
  return row.risk[pick];
}

export function tradeMetricValues(metric: string, rows: TradeRow[]): MetricValue[] {
  return rows.map((r) => {
    let value: number | null;
    switch (metric) {
      case 'exposure_pct':
        value = riskValue(r, 'exposurePct');
        break;
      case 'planned_risk_pct':
        value = riskValue(r, 'plannedRiskPct');
        break;
      case 'leverage':
        value = r.leverage;
        break;
      default:
        value = null;
    }
    return { subjectId: r.id, value };
  });
}

export function dayMetricValues(
  metric: string,
  rows: TradeRow[],
  tzOffsetMin: number,
): MetricValue[] {
  const byDay = new Map<string, TradeRow[]>();
  for (const r of rows) {
    const key = localDayKey(r.closedAt, tzOffsetMin);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(r);
    else byDay.set(key, [r]);
  }

  const days = [...byDay.keys()].sort();
  return days.map((day) => {
    const dayRows = byDay.get(day)!;
    if (metric === 'trades_per_day') return { subjectId: day, value: dayRows.length };

    if (metric === 'daily_loss_pct') {
      // Баланс на начало суток — тот, что был на входе в первую сделку дня.
      // Точнее взять неоткуда: снимки часовые, а сделки могут идти чаще.
      const first = [...dayRows].sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime())[0];
      const base = first.risk?.ok ? first.risk.balanceAtEntry : null;
      if (base === null || base === undefined || base <= 0) return { subjectId: day, value: null };
      const pnl = dayRows.reduce((s, r) => s + r.closedPnl, 0);
      // Убыток положительным числом: правило звучит «не больше 5%», и заставлять
      // пользователя думать про знак порога — лишняя работа на пустом месте.
      return { subjectId: day, value: pnl >= 0 ? 0 : (-pnl / base) * 100 };
    }

    return { subjectId: day, value: null };
  });
}
