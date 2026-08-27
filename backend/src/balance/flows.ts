import { PrismaService } from '../prisma/prisma.service';
import type { Flow } from './balance-chain';

/**
 * Биржи, у которых closedPnl НЕ включает комиссии, — их надо вычесть отдельно.
 *
 * Разведка (Task 1) установила две такие биржи из семи:
 *  - Binance: сотрудник на форуме разработчиков прямо пишет, что «REALIZED_PNL
 *    doesn't include the fee so you'll need to deduct the fees from it».
 *  - Bitget: адаптер берёт поле `pnl`, а не `netProfit`, и на реальном ответе
 *    API сходится `pnl + openFee + closeFee + totalFunding = netProfit` — то
 *    есть `pnl` стоит ДО комиссий.
 *
 * Ошибиться здесь можно в обе стороны, и обе дают один симптом. Вычесть
 * комиссии там, где они уже вычтены, — ряд поедет вниз. Не вычесть там, где
 * они не вычтены, — поедет вверх. Поехавший в любую сторону ряд код прочитает
 * как ввод или вывод средств, то есть придумает пользователю движение денег,
 * которого не было.
 *
 * Знак: в ответах бирж комиссии приходят отрицательными, но адаптеры кладут их
 * в базу через Math.abs() — в `Trade.openFee` и `Trade.closeFee` лежат
 * положительные величины. Поэтому здесь именно ВЫЧИТАНИЕ. Прибавление, взятое
 * по аналогии с формулой из документации Bitget, дало бы удвоенную ошибку
 * вместо нулевой.
 */
const FEES_EXCLUDED_FROM_PNL = new Set<string>(['binance', 'bitget']);

/**
 * Торговые потоки между двумя моментами: всё, что двигало баланс торговлей.
 *
 * Фандинг лежит отдельной моделью и ни в один из вариантов closedPnl не
 * входит. Его знак — «плюс значит пользователь заплатил», поэтому в поток он
 * идёт со знаком минус.
 */
export async function loadFlows(
  prisma: PrismaService,
  userId: string,
  exchange: string,
  from: Date,
  to: Date,
): Promise<Flow[]> {
  const [trades, funding] = await Promise.all([
    prisma.trade.findMany({
      where: { userId, exchange, closedAt: { gt: from, lte: to } },
      select: { closedAt: true, closedPnl: true, openFee: true, closeFee: true },
    }),
    prisma.fundingFee.findMany({
      where: { userId, exchange, at: { gt: from, lte: to } },
      select: { at: true, amount: true },
    }),
  ]);
  const deductFees = FEES_EXCLUDED_FROM_PNL.has(exchange);
  return [
    ...trades.map((t) => ({
      at: t.closedAt,
      amount: deductFees ? t.closedPnl - t.openFee - t.closeFee : t.closedPnl,
    })),
    ...funding.map((f) => ({ at: f.at, amount: -f.amount })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
}
