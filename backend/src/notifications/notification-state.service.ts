import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decide } from './notification-state';

@Injectable()
export class NotificationStateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Прогоняет один тик сигнала с порогом через фронт нарастания и cooldown,
   * записывает новое состояние и отвечает, надо ли слать.
   */
  async check(
    userId: string,
    key: string,
    holds: boolean,
    cooldownMs: number,
    now: Date = new Date(),
  ): Promise<boolean> {
    const row = await this.prisma.notificationState.findUnique({
      where: { userId_key: { userId, key } },
    });
    const verdict = decide(row ?? null, holds, now, cooldownMs);
    const lastSentAt = verdict.send ? now : (row?.lastSentAt ?? null);
    await this.prisma.notificationState.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, activeSince: verdict.activeSince, lastSentAt },
      update: { activeSince: verdict.activeSince, lastSentAt },
    });
    return verdict.send;
  }

  /**
   * Для событийных сигналов, у которых нет «условия»: их фронт — сам факт
   * события, и проверяется только cooldown.
   */
  async canSendEvent(
    userId: string,
    key: string,
    cooldownMs: number,
    now: Date = new Date(),
  ): Promise<boolean> {
    if (cooldownMs <= 0) return true;
    const row = await this.prisma.notificationState.findUnique({
      where: { userId_key: { userId, key } },
    });
    const last = row?.lastSentAt?.getTime();
    return last == null || now.getTime() - last >= cooldownMs;
  }

  async markSent(userId: string, key: string, now: Date = new Date()): Promise<void> {
    await this.prisma.notificationState.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, lastSentAt: now },
      update: { lastSentAt: now },
    });
  }
}
