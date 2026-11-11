import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Direction } from '../terminal-math';

/** Подводящий стоп позиции на бирже: стоп идёт за маркировкой на `distance` до безубытка. */
export interface TrailPlan {
  id: string;
  userId: string;
  symbol: string;
  direction: Direction;
  distance: number;
  /** Ордера, которые позицию откроют: неувиденный план ждёт их. */
  orderIds: string[];
  /** Позицию уже видели — её не стало, план кончился. */
  seen: boolean;
  active: boolean;
  createdAt: Date;
}

export type TrailUpdate = Partial<Pick<TrailPlan, 'seen' | 'active'>>;

/**
 * Планы подводящего стопа (спека 2026-11-11-trailing-stop-design.md): `api`
 * заводит и снимает, `worker` ведёт (`TrailStopService`). Один план на позицию —
 * монету и сторону.
 */
@Injectable()
export class TrailStopStore {
  constructor(private readonly prisma: PrismaService) {}

  /** Новый план позиции — поверх прежнего: время создания тоже новое (от него ждёт неувиденный). */
  async put(
    userId: string,
    p: {
      symbol: string;
      direction: Direction;
      distance: number;
      orderIds: string[];
      seen: boolean;
    },
  ): Promise<void> {
    const data = {
      distance: p.distance,
      orderIds: p.orderIds,
      seen: p.seen,
      active: true,
      createdAt: new Date(),
    };
    await this.prisma.terminalTrailStop.upsert({
      where: {
        userId_symbol_direction: {
          userId,
          symbol: p.symbol,
          direction: p.direction,
        },
      },
      create: { userId, symbol: p.symbol, direction: p.direction, ...data },
      update: data,
    });
  }

  /** Ордер без галочки на свободную сторону: план, ждавший позицию, снимается — открывающий ордер решает. */
  async dropUnseen(
    userId: string,
    symbol: string,
    direction: Direction,
  ): Promise<void> {
    await this.prisma.terminalTrailStop.deleteMany({
      where: { userId, symbol, direction, seen: false },
    });
  }

  /** Подводящий выключили. */
  async remove(
    userId: string,
    symbol: string,
    direction: Direction,
  ): Promise<void> {
    await this.prisma.terminalTrailStop.deleteMany({
      where: { userId, symbol, direction },
    });
  }

  /** Расстояния активных планов — ключ `символ:сторона`, для позиций на экране. */
  async activeDistances(userId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.terminalTrailStop.findMany({
      where: { userId, active: true },
      select: { symbol: true, direction: true, distance: true },
    });
    return new Map(rows.map((r) => [`${r.symbol}:${r.direction}`, r.distance]));
  }

  /** Кому поток держит соединение и без открытого экрана. */
  async activeUsers(): Promise<string[]> {
    const rows = await this.prisma.terminalTrailStop.findMany({
      where: { active: true },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((r) => r.userId);
  }

  async activeOf(userId: string): Promise<TrailPlan[]> {
    const rows = await this.prisma.terminalTrailStop.findMany({
      where: { userId, active: true },
    });
    return rows.map((r) => ({ ...r, direction: r.direction as Direction }));
  }

  /**
   * Запись шага — только в тот же план. `put` того же ключа оставляет id, но ставит
   * новое время создания: шаг, начатый по прежнему плану, новый не погасит.
   */
  async update(
    plan: Pick<TrailPlan, 'id' | 'createdAt'>,
    data: TrailUpdate,
  ): Promise<boolean> {
    const res = await this.prisma.terminalTrailStop.updateMany({
      where: { id: plan.id, createdAt: plan.createdAt },
      data,
    });
    return res.count > 0;
  }
}
