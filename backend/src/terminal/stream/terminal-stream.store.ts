import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { StoredStream, StreamState } from './stream-state';
import type { StreamStore } from './terminal-stream.service';

/** Отмечать спрос не чаще: окно спроса у worker — 60 с, три отметки в него помещаются. */
const WANT_EVERY_MS = 20_000;
/** Выше — выметать старые отметки из памяти процесса. */
const SWEEP_ABOVE = 2_000;

/**
 * Строки `terminal_streams`. `api` пишет спрос и читает состояние, `worker` —
 * пишет состояние и пульс; колонки у них не пересекаются.
 */
@Injectable()
export class TerminalStreamStore implements StreamStore {
  private readonly logger = new Logger(TerminalStreamStore.name);
  /** Когда этот процесс последний раз отмечал спрос пользователя. */
  private readonly wantedAt = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  /** Экран спрашивал счёт. Без ожидания: опрос не должен ждать записи. */
  want(userId: string): void {
    const now = Date.now();
    if (now - (this.wantedAt.get(userId) ?? 0) < WANT_EVERY_MS) return;
    this.wantedAt.set(userId, now);
    if (this.wantedAt.size > SWEEP_ABOVE) {
      for (const [id, at] of this.wantedAt) if (now - at >= WANT_EVERY_MS) this.wantedAt.delete(id);
    }
    const at = new Date(now);
    const failed = (e: Error) => {
      this.wantedAt.delete(userId);
      this.logger.warn(`спрос потока не записан: ${e.message}`);
    };
    // Опрос счёта не должен упасть из-за отметки спроса — ни на отказе базы, ни синхронно.
    try {
      this.prisma.terminalStream
        .upsert({ where: { userId }, create: { userId, wantedAt: at }, update: { wantedAt: at } })
        .catch(failed);
    } catch (e) {
      failed(e as Error);
    }
  }

  read(userId: string): Promise<StoredStream | null> {
    return this.prisma.terminalStream.findUnique({
      where: { userId },
      select: { keyHash: true, state: true, liveAt: true, eventAt: true },
    });
  }

  async wanted(since: Date): Promise<string[]> {
    const rows = await this.prisma.terminalStream.findMany({ where: { wantedAt: { gte: since } }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  async save(userId: string, row: { keyHash: string; state: StreamState; eventAt: Date }): Promise<void> {
    await this.prisma.terminalStream.updateMany({
      where: { userId },
      data: { keyHash: row.keyHash, state: row.state as unknown as Prisma.InputJsonValue, eventAt: row.eventAt, liveAt: new Date() },
    });
  }

  async heartbeat(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    await this.prisma.terminalStream.updateMany({ where: { userId: { in: userIds } }, data: { liveAt: new Date() } });
  }

  /**
   * Соединения больше нет. Обнуляется и отпечаток с состоянием, а не только
   * пульс: пакетный пульс (`heartbeat`), отправленный до сброса и дошедший
   * после, оживил бы `liveAt`, — но строке без своего отпечатка `api` не верит.
   */
  async drop(userId: string): Promise<void> {
    await this.prisma.terminalStream.updateMany({
      where: { userId },
      data: { liveAt: null, keyHash: null, state: Prisma.DbNull },
    });
  }
}
