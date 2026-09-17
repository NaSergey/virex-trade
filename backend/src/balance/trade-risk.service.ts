import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnchorRow, BalanceHistoryService } from './balance-history.service';

/** Версия набора полей. Растёт, когда меняется формула — строки старой версии пересчитываются. */
export const RISK_VERSION = 1;

// T14 (A5): тот же паттерн и то же значение, что BATCH_LIMIT в
// TradeContextService (trade-context.service.ts) — прогон на пользователя
// с годом непосчитанных сделок не занимает часовой цикл целиком, а
// прогрессивно добирает остаток на следующих тиках.
const BATCH_LIMIT = 400;

export interface RiskInput {
  qty: number;
  avgEntryPrice: number;
  stopLoss: number | null;
}

export interface RiskOutput {
  exposurePct: number | null;
  plannedRiskPct: number | null;
  ok: boolean;
}

/**
 * Метрики риска одной сделки.
 *
 * Экспозиция — доля депозита в номинале позиции, а не в марже: при плече
 * «сколько денег в рынке» и «сколько своих внесено» расходятся в разы, и
 * правило должно ограничивать первое. Плановый риск берёт модуль разности,
 * чтобы шорт со стопом выше входа считался той же формулой — иначе у него
 * риск выходил отрицательным и соблюдал любое правило.
 */
export function riskOf(trade: RiskInput, balance: number | null): RiskOutput {
  if (balance === null || !Number.isFinite(balance) || balance <= 0) {
    return { exposurePct: null, plannedRiskPct: null, ok: false };
  }
  const notional = trade.qty * trade.avgEntryPrice;
  const exposurePct = (notional / balance) * 100;
  const plannedRiskPct =
    trade.stopLoss === null
      ? null
      : ((trade.qty * Math.abs(trade.avgEntryPrice - trade.stopLoss)) / balance) * 100;
  return { exposurePct, plannedRiskPct, ok: true };
}

@Injectable()
export class TradeRiskService {
  private readonly logger = new Logger(TradeRiskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly history: BalanceHistoryService,
  ) {}

  /**
   * Досчитывает метрики сделкам, у которых их ещё нет.
   *
   * Тот же приём, что в TradeContextService: считаем только тем, у кого нет,
   * а строки устаревшей версии сначала удаляем — иначе новая формула никогда
   * не доедет до уже посчитанных сделок и продукт будет показывать два разных
   * определения риска одновременно.
   *
   * T14 (A5): `take: BATCH_LIMIT`, как у TradeContextService — без лимита
   * пользователь с годом непосчитанных сделок занимал бы часовой обход
   * целиком; якоря баланса читаются один раз на (пользователя, биржу) перед
   * циклом, а не заново на каждую сделку через `balanceAt`; запись —
   * `createMany` одной пачкой, а не по строке на сделку.
   */
  async computeMissing(userId: string): Promise<number> {
    await this.prisma.tradeRisk.deleteMany({
      where: { riskVersion: { lt: RISK_VERSION }, trade: { userId } },
    });
    const trades = await this.prisma.trade.findMany({
      where: { userId, risk: null },
      take: BATCH_LIMIT,
      select: {
        id: true,
        exchange: true,
        qty: true,
        avgEntryPrice: true,
        stopLoss: true,
        openedAt: true,
        closedAt: true,
      },
    });
    if (trades.length === 0) return 0;

    // Один запрос якорей на каждую встретившуюся в пачке биржу (обычно одна —
    // activeExchange у пользователя одна, — но исторические сделки со
    // сменённой биржи тоже должны получить свой набор якорей), а не по
    // запросу на сделку.
    const anchorsByExchange = new Map<string, AnchorRow[]>();
    for (const exchange of new Set(trades.map((t) => t.exchange))) {
      anchorsByExchange.set(exchange, await this.history.loadAnchorRows(userId, exchange));
    }

    const data: Prisma.TradeRiskCreateManyInput[] = [];
    for (const t of trades) {
      // Момент входа, а не закрытия: правило ограничивает решение, принятое
      // на входе, и мерить его балансом, уже изменённым исходом этой самой
      // сделки, значит оценивать решение по его результату.
      const at = t.openedAt ?? t.closedAt;
      const found = await this.history.balanceAt(userId, t.exchange, at, anchorsByExchange.get(t.exchange));
      const risk = riskOf(
        { qty: t.qty, avgEntryPrice: t.avgEntryPrice, stopLoss: t.stopLoss },
        found?.balance ?? null,
      );
      data.push({
        tradeId: t.id,
        balanceAtEntry: found?.balance ?? null,
        balanceSource: found?.source ?? null,
        exposurePct: risk.exposurePct,
        plannedRiskPct: risk.plannedRiskPct,
        ok: risk.ok,
        riskVersion: RISK_VERSION,
      });
    }

    const res = await this.prisma.tradeRisk.createMany({ data });
    return res.count;
  }
}
