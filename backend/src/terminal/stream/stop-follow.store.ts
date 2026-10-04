import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Direction } from '../terminal-math';

export interface FollowPlan {
  id: string;
  userId: string;
  symbol: string;
  direction: Direction;
  entryPrice: number;
  orderIds: string[];
  prices: number[];
  /** Цель стопа после каждого тейка, параллельно `orderIds`; 0 или нет элемента — правило. */
  stops: number[];
  filled: string[];
  fillPrices: number[];
  cancelled: string[];
  target: number | null;
  applied: boolean;
  active: boolean;
}

export type FollowUpdate = Partial<Pick<FollowPlan, 'filled' | 'fillPrices' | 'cancelled' | 'target' | 'applied' | 'active'>>;

/** Планы стопа за тейками: `api` заводит и снимает, `worker` ведёт. */
@Injectable()
export class StopFollowStore {
  constructor(private readonly prisma: PrismaService) {}

  /** Сетка с флажком: прежний план позиции заменяется новым — с новым id. */
  async replace(
    userId: string,
    p: { symbol: string; direction: Direction; entryPrice: number; orderIds: string[]; prices: number[]; stops: number[] },
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.terminalStopFollow.deleteMany({ where: { userId, symbol: p.symbol, direction: p.direction } }),
      this.prisma.terminalStopFollow.create({ data: { userId, ...p } }),
    ]);
  }

  /** Сетка без флажка: прежние тейки она и так сняла, и вести больше нечего. */
  async remove(userId: string, symbol: string, direction: Direction): Promise<void> {
    await this.prisma.terminalStopFollow.deleteMany({ where: { userId, symbol, direction } });
  }

  /** Позиции с активным планом — ключ `символ:сторона`, для флажка на экране. */
  async activeKeys(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.terminalStopFollow.findMany({
      where: { userId, active: true },
      select: { symbol: true, direction: true },
    });
    return new Set(rows.map((r) => `${r.symbol}:${r.direction}`));
  }

  /** Кому поток держит соединение и без открытого экрана. */
  async activeUsers(): Promise<string[]> {
    const rows = await this.prisma.terminalStopFollow.findMany({
      where: { active: true },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((r) => r.userId);
  }

  async activeOf(userId: string): Promise<FollowPlan[]> {
    const rows = await this.prisma.terminalStopFollow.findMany({ where: { userId, active: true } });
    return rows.map((r) => ({ ...r, direction: r.direction as Direction }));
  }

  /** Запись шага — только в тот же план: заменённый новой сеткой не трогается. false — плана уже нет. */
  async update(id: string, data: FollowUpdate): Promise<boolean> {
    const res = await this.prisma.terminalStopFollow.updateMany({ where: { id }, data });
    return res.count > 0;
  }
}
