import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ReferralStats {
  total: number;
  withKey: number;
  slug: string | null;
}

/**
 * Статистика по приглашённым и управление кастомным слагом ссылки.
 *
 * «Сейчас», а не «когда-либо»: у withKey нет отдельного флага «был
 * подключён» — он разошёлся бы с реальным состоянием в момент отключения
 * ключа (`settings.controller` такой путь уже поддерживает), и число
 * обманывало бы пригласившего.
 */
@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(userId: string): Promise<ReferralStats> {
    const [total, withKey, user] = await Promise.all([
      this.prisma.user.count({ where: { invitedById: userId } }),
      this.prisma.user.count({
        where: { invitedById: userId, exchangeConnections: { some: {} } },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { referralSlug: true } }),
    ]);
    return { total, withKey, slug: user?.referralSlug ?? null };
  }

  /**
   * Свободен ли слаг для всех, кроме самого пользователя — иначе повторный
   * ввод своего же текущего слага показывал бы «занято».
   */
  async isSlugAvailable(slug: string, excludeUserId: string): Promise<boolean> {
    const taken = await this.prisma.user.count({
      where: { referralSlug: slug, id: { not: excludeUserId } },
    });
    return taken === 0;
  }

  /**
   * Сохраняет слаг. Уникальность держит индекс БД, а не проверка здесь —
   * между `isSlugAvailable` и сохранением кто-то другой мог успеть занять то
   * же имя; такую гонку превращаем в понятную ошибку, а не в 500.
   */
  async setSlug(userId: string, slug: string): Promise<{ slug: string }> {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { referralSlug: slug },
        select: { referralSlug: true },
      });
      return { slug: user.referralSlug! };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException({ message: 'Это имя уже занято', code: 'SLUG_TAKEN' });
      }
      throw e;
    }
  }
}
