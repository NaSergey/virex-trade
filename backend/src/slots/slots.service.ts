import { Injectable } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import { BattlePassService } from '../battlepass/battlepass.service';
import { XP_SOURCES } from '../battlepass/xp-registry';
import { CoinsService } from '../coins/coins.service';
import { PrismaService } from '../prisma/prisma.service';
import { BETS } from './slots.config';
import {
  expectedReturn,
  FREE_MULT,
  FREE_SPINS,
  LINE_PAYS,
  PAYLINES,
  PICK_BOXES,
  PICK_PRIZES,
  play,
  WHEEL,
  type Outcome,
} from './slots';

export interface SlotsSpin extends Outcome {
  id: string;
  bet: number;
  balance: number;
}

/**
 * Слоты против заведения: спин — одна транзакция «списать ставку, начислить
 * выигрыш вместе со всеми бонусами, опыт». Бонусные раунды разыгрываются
 * здесь же целиком (`play`), экран их только проигрывает: закрытая посреди
 * бонуса вкладка ничего не теряет, а в базе нет полуигранного состояния.
 * Исход решает `crypto.randomInt`.
 */
@Injectable()
export class SlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coins: CoinsService,
    private readonly battlePass: BattlePassService,
  ) {}

  /** Правила для экрана: своей копии таблицы выплат у фронта нет. */
  config() {
    return {
      bets: BETS,
      paylines: PAYLINES,
      linePays: LINE_PAYS,
      freeSpins: FREE_SPINS,
      freeMult: FREE_MULT,
      pickBoxes: PICK_BOXES,
      pickPrizes: PICK_PRIZES.map(([v]) => v),
      wheel: WHEEL,
      rtp: Math.round(expectedReturn() * 1000) / 10,
    };
  }

  async spin(userId: string, bet: number): Promise<SlotsSpin> {
    const id = randomUUID();
    const out = play((n) => randomInt(n), bet);
    await this.prisma.$transaction(async (tx) => {
      await this.coins.charge(tx, userId, bet, 'SLOTS_BET', id);
      if (out.win > 0)
        await this.coins.credit(tx, userId, out.win, 'SLOTS_WIN', id);
      await this.battlePass.award(
        tx,
        userId,
        'game.slots',
        id,
        XP_SOURCES['game.slots'].base,
      );
    });
    return { id, bet, ...out, balance: await this.coins.balance(userId) };
  }
}
