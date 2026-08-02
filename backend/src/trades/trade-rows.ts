import { PrismaService } from '../prisma/prisma.service';
import { collapseToPositions, entryTimeOf } from './positions';

/**
 * Общая загрузка позиций для аналитики: «Выборка» (LabService) и «Цена
 * привычек» (HabitsService) считают по одному и тому же набору строк, поэтому
 * маппинг живёт здесь, а не в одном из сервисов.
 *
 * Время входа берётся из `entryTimeOf` — то есть из positionId, собранного по
 * истории исполнений. Раньше Lab читал `openedAt ?? closedAt`: первое опаздывает
 * на интервал опроса биржи, второе вообще относится к выходу, поэтому час и
 * день недели «входа» местами уезжали на соседний бакет.
 */

// Торговые сессии по UTC (непересекающиеся, чтобы сделка попадала ровно в одну):
// Азия 00–08, Лондон 08–14, Нью-Йорк 14–21, ночь 21–24.
export const SESSIONS: Record<string, [number, number]> = {
  asia: [0, 8],
  london: [8, 14],
  ny: [14, 21],
  night: [21, 24],
};

export interface RowCtx {
  ok: boolean;
  atrPct: number | null;
  volRel: number | null;
  ema200Above: boolean | null;
  trend4h: string | null;
  rangePos15m: number | null;
  rangePos30m: number | null;
  rangePos1h: number | null;
  rangePos4h: number | null;
  rangePos1d: number | null;
}

export interface Row {
  id: string;
  symbol: string;
  direction: string;
  closedPnl: number;
  closedAt: Date;
  openedAt: Date | null;
  qty: number;
  avgEntryPrice: number;
  avgExitPrice: number;
  parts: number; // закрывающих ордеров в позиции
  // derived
  entryMs: number; // момент входа (из филлов, когда он известен)
  entryBasis: 'filled' | 'opened' | 'closed';
  holdMs: number; // сколько позиция прожила
  notional: number; // qty * avgEntryPrice — размер входа в деньгах
  tagSet: Set<string>;
  session: string;
  weekday: number; // user-local
  hour: number; // user-local
  ctx: RowCtx | null;
  tags: Array<{ id: string; name: string; color: string }>;
}

export interface LoadedRows {
  rows: Row[];
  /** Медианы по всему периоду — стабильная точка отсчёта для «выше/ниже среднего». */
  medAtr: number | null;
  medVol: number | null;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function loadRows(
  prisma: PrismaService,
  userId: string,
  days?: number,
  tzOffsetMin?: number,
): Promise<LoadedRows> {
  const where: { userId: string; closedAt?: { gte: Date } } = { userId };
  if (days && days > 0) {
    where.closedAt = { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
  }

  // Collapsed to positions first: every count, winrate and facet downstream then
  // describes positions taken rather than closing orders sent, so scaling out
  // of a winner no longer registers as several winning trades.
  const raw = collapseToPositions(
    await prisma.trade.findMany({
      where,
      orderBy: { closedAt: 'asc' },
      include: { tags: { include: { tag: true } }, context: true },
    }),
  );

  const tz = Number.isFinite(tzOffsetMin) ? (tzOffsetMin as number) : 0;
  const rows: Row[] = raw.map((t) => {
    const entry = entryTimeOf(t);
    const local = new Date(entry.ms - tz * 60_000);
    const utcHour = new Date(entry.ms).getUTCHours();
    const session =
      Object.entries(SESSIONS).find(([, [a, b]]) => utcHour >= a && utcHour < b)?.[0] ?? 'night';
    return {
      id: t.id,
      symbol: t.symbol,
      direction: t.direction,
      closedPnl: t.closedPnl,
      closedAt: t.closedAt,
      openedAt: t.openedAt,
      qty: t.qty,
      avgEntryPrice: t.avgEntryPrice,
      avgExitPrice: t.avgExitPrice,
      parts: t.parts,
      entryMs: entry.ms,
      entryBasis: entry.basis,
      // basis 'closed' = времени входа нет вовсе, тогда «время в позиции» не
      // 0, а неизвестно — поведенческие метрики такие строки пропускают.
      holdMs: entry.basis === 'closed' ? -1 : t.closedAt.getTime() - entry.ms,
      notional: t.qty * t.avgEntryPrice,
      tagSet: new Set(t.tags.map((tt) => tt.tagId)),
      session,
      weekday: local.getUTCDay(),
      hour: local.getUTCHours(),
      ctx: t.context
        ? {
            ok: t.context.ok,
            atrPct: t.context.atrPct,
            volRel: t.context.volRel,
            ema200Above: t.context.ema200Above,
            trend4h: t.context.trend4h,
            rangePos15m: t.context.rangePos15m,
            rangePos30m: t.context.rangePos30m,
            rangePos1h: t.context.rangePos1h,
            rangePos4h: t.context.rangePos4h,
            rangePos1d: t.context.rangePos1d,
          }
        : null,
      tags: t.tags.map((tt) => ({ id: tt.tag.id, name: tt.tag.name, color: tt.tag.color })),
    };
  });

  const okRows = rows.filter((r) => r.ctx?.ok);
  return {
    rows,
    medAtr: median(okRows.map((r) => r.ctx!.atrPct).filter((v): v is number => v != null)),
    medVol: median(okRows.map((r) => r.ctx!.volRel).filter((v): v is number => v != null)),
  };
}
