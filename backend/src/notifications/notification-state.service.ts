import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StateRow, decide } from './notification-state';

interface PendingWrite {
  userId: string;
  key: string;
  activeSince: Date | null;
  lastSentAt: Date | null;
}

/**
 * Пачка состояний на один тик рыночных сигналов.
 *
 * `MarketAlertsService.tick` проверяет фронт нарастания и cooldown у сотен
 * пользователей на семь сигналов подряд; построчный `findUnique`+`upsert`
 * (см. {@link NotificationStateService.check}) на каждую пару — тысячи
 * round-trip'ов за тик. Батч поднимает нужные строки одним `findMany`
 * (см. {@link NotificationStateService.beginBatch}), после чего `check()`
 * решает по кэшу в памяти и копит изменения, а `flush()` пишет их одним
 * запросом. Логика решения — та же `decide()`, что и в построчном `check`.
 */
export class NotificationStateBatch {
  private readonly cache: Map<string, StateRow>;
  private readonly pending = new Map<string, PendingWrite>();

  constructor(
    private readonly prisma: PrismaService,
    rows: Array<{
      userId: string;
      key: string;
      activeSince: Date | null;
      lastSentAt: Date | null;
    }>,
  ) {
    this.cache = new Map(
      rows.map((r) => [
        `${r.userId}|${r.key}`,
        { activeSince: r.activeSince, lastSentAt: r.lastSentAt },
      ]),
    );
  }

  /** Тот же контракт, что у {@link NotificationStateService.check}, без похода в БД. */
  check(
    userId: string,
    key: string,
    holds: boolean,
    cooldownMs: number,
    now: Date,
  ): boolean {
    const cacheKey = `${userId}|${key}`;
    // Уже принятое в этом же тике решение (pending) важнее прочитанной строки:
    // сигнал типа mkt.price1h/mkt.vol1h зовёт check дважды за тик разными
    // ключами, но на один и тот же ключ — максимум один раз, так что здесь
    // это скорее защита на будущее, чем реальный кейс.
    const row = this.pending.get(cacheKey) ?? this.cache.get(cacheKey) ?? null;
    const verdict = decide(row, holds, now, cooldownMs);
    const lastSentAt = verdict.send ? now : (row?.lastSentAt ?? null);
    this.pending.set(cacheKey, {
      userId,
      key,
      activeSince: verdict.activeSince,
      lastSentAt,
    });
    return verdict.send;
  }

  /**
   * Пишет все решения тика одним запросом — `INSERT ... ON CONFLICT DO
   * UPDATE`, точный аналог построчного `upsert`. Значения (userId, key,
   * даты) идут только через параметры tagged-template (`Prisma.sql`/
   * `Prisma.join`), не строковой конкатенацией.
   */
  async flush(): Promise<void> {
    if (this.pending.size === 0) return;
    const rows = [...this.pending.values()];
    const values = Prisma.join(
      rows.map(
        (r) =>
          Prisma.sql`(${randomUUID()}, ${r.userId}, ${r.key}, ${r.activeSince}, ${r.lastSentAt})`,
      ),
    );
    await this.prisma.$executeRaw`
      INSERT INTO "notification_states" (id, "userId", key, "activeSince", "lastSentAt")
      VALUES ${values}
      ON CONFLICT ("userId", key)
      DO UPDATE SET "activeSince" = EXCLUDED."activeSince", "lastSentAt" = EXCLUDED."lastSentAt"
    `;
  }
}

@Injectable()
export class NotificationStateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Пачка на тик: одним `findMany` по `(userId in […], key in […])` поднимает
   * состояния для набора пользователей и сигналов. Крест `userIds × keys` —
   * небольшой надзапрос (какой-то сигнал мог быть выключен не у всех
   * пользователей из списка), но это всё равно один запрос вместо N.
   */
  async beginBatch(
    userIds: string[],
    keys: string[],
  ): Promise<NotificationStateBatch> {
    if (userIds.length === 0 || keys.length === 0)
      return new NotificationStateBatch(this.prisma, []);
    const rows = await this.prisma.notificationState.findMany({
      where: { userId: { in: userIds }, key: { in: keys } },
      select: { userId: true, key: true, activeSince: true, lastSentAt: true },
    });
    return new NotificationStateBatch(this.prisma, rows);
  }

  /**
   * Прогоняет один тик сигнала с порогом через фронт нарастания и cooldown,
   * записывает новое состояние и отвечает, надо ли слать.
   *
   * Построчный путь — для событийных чекеров (TradeAlertsService), которые
   * проверяют одного пользователя за раз. Тик с сотнями пользователей должен
   * идти через {@link beginBatch}/{@link NotificationStateBatch.check}.
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

  async markSent(
    userId: string,
    key: string,
    now: Date = new Date(),
  ): Promise<void> {
    await this.prisma.notificationState.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, lastSentAt: now },
      update: { lastSentAt: now },
    });
  }
}
