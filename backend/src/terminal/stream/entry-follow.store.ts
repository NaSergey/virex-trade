import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Direction } from '../terminal-math';

/** Лимит сетки входа с целью стопа: исполнится — стоп позиции подтянется на `stopAfter`. */
export interface EntryFollow {
  id: string;
  userId: string;
  symbol: string;
  direction: Direction;
  orderId: string;
  price: number;
  stopAfter: number;
  /** Цена исполнения: лимит исполнен, а цель ещё не встала на бирже. */
  fillPrice: number | null;
  active: boolean;
}

export type EntryFollowUpdate = Partial<Pick<EntryFollow, 'fillPrice' | 'active'>>;

/** Планы «стопа после исполнения» сетки входа: `api` заводит, `worker` ведёт. */
@Injectable()
export class EntryFollowStore {
  constructor(private readonly prisma: PrismaService) {}

  /** Лимиты сетки, у которых задана цель. Лимит с тем же `orderId` не дублируется. */
  async add(
    userId: string,
    rows: { symbol: string; direction: Direction; orderId: string; price: number; stopAfter: number }[],
  ): Promise<void> {
    if (rows.length === 0) return;
    await this.prisma.terminalEntryFollow.createMany({
      data: rows.map((r) => ({ userId, ...r })),
      skipDuplicates: true,
    });
  }

  /** Кому поток держит соединение и без открытого экрана. */
  async activeUsers(): Promise<string[]> {
    const rows = await this.prisma.terminalEntryFollow.findMany({
      where: { active: true },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((r) => r.userId);
  }

  async activeOf(userId: string): Promise<EntryFollow[]> {
    const rows = await this.prisma.terminalEntryFollow.findMany({ where: { userId, active: true } });
    return rows.map((r) => ({ ...r, direction: r.direction as Direction }));
  }

  /** Запись шага по id строки. false — строки уже нет. */
  async update(id: string, data: EntryFollowUpdate): Promise<boolean> {
    const res = await this.prisma.terminalEntryFollow.updateMany({ where: { id }, data });
    return res.count > 0;
  }
}
