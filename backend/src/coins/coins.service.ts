import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Откуда взялась строка журнала. Строкой, как остальные статусы этой схемы. */
export type CoinTxKind =
  | 'DONATION'
  | 'TOURNAMENT_FEE'
  | 'TOURNAMENT_BONUS'
  | 'TOURNAMENT_REFUND'
  | 'TOURNAMENT_PRIZE'
  | 'GAME_BUYIN'
  | 'GAME_CASHOUT';

/**
 * Монеты: баланс пользователя и журнал движений.
 *
 * Все изменяющие методы принимают клиент транзакции, а не открывают свою: монеты
 * меняются только вместе с тем, ради чего их тронули, — строкой участника в
 * турнире или зачётом доната. Отдельная транзакция означала бы состояние, где
 * взнос уже списан, а участника нет, или наоборот.
 *
 * Списание — compare-and-set в самом UPDATE (`coinBalance >= n`), а не
 * «прочитать, проверить, записать»: два одновременных входа в турниры иначе
 * увели бы баланс в минус, и ни один из них не был бы неправ по отдельности.
 */
@Injectable()
export class CoinsService {
  constructor(private readonly prisma: PrismaService) {}

  async balance(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { coinBalance: true } });
    return user?.coinBalance ?? 0;
  }

  /**
   * Снять монеты. Не хватило — `INSUFFICIENT_COINS`, и вызывающая транзакция
   * откатывается целиком: участником турнира человек при этом не становится.
   */
  async charge(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    kind: CoinTxKind,
    refId: string,
  ): Promise<void> {
    if (!positive(amount)) return;
    const res = await tx.user.updateMany({
      where: { id: userId, coinBalance: { gte: amount } },
      data: { coinBalance: { decrement: amount } },
    });
    if (res.count !== 1) {
      throw new ConflictException({ message: 'Не хватает монет', code: 'INSUFFICIENT_COINS' });
    }
    // Баланс читается после списания и внутри той же транзакции — это ровно то
    // число, с которым строка журнала и останется.
    const user = await tx.user.findUnique({ where: { id: userId }, select: { coinBalance: true } });
    await tx.coinTransaction.create({
      data: { userId, delta: -amount, balanceAfter: user?.coinBalance ?? 0, kind, refId },
    });
  }

  /**
   * Начислить монеты. Повторный вызов с тем же `kind` и `refId` упирается в
   * уникальный ключ журнала (P2002) и роняет транзакцию — так одно событие не
   * может быть оплачено дважды, сколько бы раз его ни разобрали.
   */
  async credit(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    kind: CoinTxKind,
    refId: string,
  ): Promise<void> {
    if (!positive(amount)) return;
    const user = await tx.user.update({
      where: { id: userId },
      data: { coinBalance: { increment: amount } },
      select: { coinBalance: true },
    });
    await tx.coinTransaction.create({
      data: { userId, delta: amount, balanceAfter: user.coinBalance, kind, refId },
    });
  }

  /** Возврат взноса или добавки — то же начисление, отдельным именем по месту вызова. */
  refund(tx: Prisma.TransactionClient, userId: string, amount: number, refId: string): Promise<void> {
    return this.credit(tx, userId, amount, 'TOURNAMENT_REFUND', refId);
  }
}

/**
 * Ноль — законный случай (бесплатный турнир, пустой призовой фонд), и он не
 * должен оставлять следов: строка «начислено 0» ничего не сообщает, а ключ
 * журнала заняла бы. Отрицательное сюда приходить не должно вовсе — знак задаёт
 * метод, а не вызывающий.
 */
const positive = (amount: number) => Number.isInteger(amount) && amount > 0;
