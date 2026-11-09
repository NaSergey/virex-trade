import { Injectable } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import { BattlePassService } from '../battlepass/battlepass.service';
import { XP_SOURCES } from '../battlepass/xp-registry';
import { CoinsService } from '../coins/coins.service';
import { PrismaService } from '../prisma/prisma.service';
import { BETS } from './slots.config';
import {
  drawGrid,
  evaluate,
  expectedReturn,
  LINE_PAYS,
  PAYLINES,
  SCATTER_PAYS,
  winOf,
  type Grid,
  type LineWin,
} from './slots';

export interface SlotsSpin {
  id: string;
  bet: number;
  grid: Grid;
  lines: (LineWin & { win: number })[];
  scatters: number;
  scatterWin: number;
  win: number;
  balance: number;
}

/**
 * Слоты против заведения: спин — одна транзакция «списать ставку, начислить
 * выигрыш, опыт». Состояния между спинами нет вовсе — ни раунда, ни стола, —
 * поэтому и возвращать после перезапуска нечего. Исход решает сервер
 * (`crypto.randomInt`), браузер только проигрывает его.
 */
@Injectable()
export class SlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coins: CoinsService,
    private readonly battlePass: BattlePassService,
  ) {}

  /** Правила для экрана: таблица выплат и линии едут отсюда, своей копии у фронта нет. */
  config() {
    return {
      bets: BETS,
      paylines: PAYLINES,
      linePays: LINE_PAYS,
      scatterPays: SCATTER_PAYS,
      rtp: Math.round(expectedReturn() * 1000) / 10,
    };
  }

  async spin(userId: string, bet: number): Promise<SlotsSpin> {
    const id = randomUUID();
    const grid = drawGrid((n) => randomInt(n));
    const ev = evaluate(grid);
    const win = winOf(ev, bet);
    const lineBet = bet / PAYLINES.length;
    await this.prisma.$transaction(async (tx) => {
      await this.coins.charge(tx, userId, bet, 'SLOTS_BET', id);
      if (win > 0) await this.coins.credit(tx, userId, win, 'SLOTS_WIN', id);
      await this.battlePass.award(
        tx,
        userId,
        'game.slots',
        id,
        XP_SOURCES['game.slots'].base,
      );
    });
    return {
      id,
      bet,
      grid,
      lines: ev.lines.map((l) => ({ ...l, win: l.pay * lineBet })),
      scatters: ev.scatters,
      scatterWin: ev.scatterPay * bet,
      win,
      balance: await this.coins.balance(userId),
    };
  }
}
