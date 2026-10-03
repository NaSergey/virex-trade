import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Prefs, mergePrefs, toStored } from './prefs';

@Injectable()
export class PrefsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<Prefs> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notifyPrefs: true },
    });
    return mergePrefs(user?.notifyPrefs);
  }

  async save(userId: string, prefs: Prefs): Promise<Prefs> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { notifyPrefs: toStored(prefs) as unknown as Prisma.InputJsonValue },
    });
    return prefs;
  }

  /** Все, у кого привязан чат, вместе с их настройками — один запрос на тик. */
  async linkedUsers(): Promise<Array<{ id: string; chatId: string; prefs: Prefs }>> {
    const rows = await this.prisma.user.findMany({
      where: { telegramChatId: { not: null } },
      select: { id: true, telegramChatId: true, notifyPrefs: true },
    });
    return rows.map((r) => ({
      id: r.id,
      chatId: r.telegramChatId as string,
      prefs: mergePrefs(r.notifyPrefs),
    }));
  }
}
