import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ReferralStats {
  total: number;
  withKey: number;
}

/**
 * Статистика по приглашённым: сколько зарегистрировалось по ссылке
 * пользователя и сколько из них сейчас держат подключённый ключ биржи.
 *
 * «Сейчас», а не «когда-либо»: отдельного флага «был подключён» нет — он
 * разошёлся бы с реальным состоянием в момент отключения ключа
 * (`settings.controller` такой путь уже поддерживает), и число обманывало бы
 * пригласившего.
 */
@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(userId: string): Promise<ReferralStats> {
    const [total, withKey] = await Promise.all([
      this.prisma.user.count({ where: { invitedById: userId } }),
      this.prisma.user.count({
        where: { invitedById: userId, exchangeConnections: { some: {} } },
      }),
    ]);
    return { total, withKey };
  }
}
