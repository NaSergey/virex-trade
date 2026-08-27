import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BalanceHistoryService } from './balance-history.service';

/** Версия набора полей. Растёт, когда меняется формула — строки старой версии пересчитываются. */
export const RISK_VERSION = 1;

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
   */
  async computeMissing(userId: string): Promise<number> {
    await this.prisma.tradeRisk.deleteMany({
      where: { riskVersion: { lt: RISK_VERSION }, trade: { userId } },
    });
    const trades = await this.prisma.trade.findMany({
      where: { userId, risk: null },
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

    let done = 0;
    for (const t of trades) {
      // Момент входа, а не закрытия: правило ограничивает решение, принятое
      // на входе, и мерить его балансом, уже изменённым исходом этой самой
      // сделки, значит оценивать решение по его результату.
      const at = t.openedAt ?? t.closedAt;
      const found = await this.history.balanceAt(userId, t.exchange, at);
      const risk = riskOf(
        { qty: t.qty, avgEntryPrice: t.avgEntryPrice, stopLoss: t.stopLoss },
        found?.balance ?? null,
      );
      await this.prisma.tradeRisk.create({
        data: {
          tradeId: t.id,
          balanceAtEntry: found?.balance ?? null,
          balanceSource: found?.source ?? null,
          exposurePct: risk.exposurePct,
          plannedRiskPct: risk.plannedRiskPct,
          ok: risk.ok,
          riskVersion: RISK_VERSION,
        },
      });
      done += 1;
    }
    return done;
  }
}
