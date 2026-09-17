import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { runsBackgroundJobs } from '../../role';
import { ACTIVITY_RETENTION_DAYS, DAY_MS } from './visits';

const SWEEP_INTERVAL_MS = 24 * 60 * 60_000; // daily

/**
 * Сметает строки активности старше срока хранения (T18,
 * docs/deploy/user-activity-retention.md).
 *
 * `UserActivityMinute` — самая быстрорастущая таблица продукта (строка на
 * пользователя на минуту, до сотен млн строк в год при 1000 онлайн), и без
 * срока жизни она растёт без границ. Ничто, кроме этого сервиса, строки не
 * удаляет: UsageTrackerService только пишет их пачками, а отчёты в админке
 * только читают.
 *
 * По образцу RefreshTokenCleanupService: только роль `worker` (и дефолтная
 * `all`), первый прогон сразу при старте, дальше по интервалу. Интервал взят
 * раз в сутки, а не раз в час, как у refresh-токенов — здесь нет требования
 * быстро освобождать ресурс после истечения, только не дать таблице расти
 * бесконечно, а удаление такого объёма строк дороже одиночного DELETE по id.
 */
@Injectable()
export class UsageCleanupService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(UsageCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    // T11: фоновый сервис — только роль worker (и дефолтная all).
    if (!runsBackgroundJobs()) return;
    // Не блокируем старт: первый прогон убирает всё, что накопилось, пока
    // сервис не работал (включая весь бэклог сразу после выкладки T18).
    this.sweep().catch((e) =>
      this.logger.error('initial usage sweep failed', e),
    );
    this.timer = setInterval(() => {
      this.sweep().catch((e) =>
        this.logger.error('periodic usage sweep failed', e),
      );
    }, SWEEP_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(): Promise<{
    deletedMinutes: number;
    deletedSectionDays: number;
  }> {
    const cutoff = new Date(Date.now() - ACTIVITY_RETENTION_DAYS * DAY_MS);

    const [minutes, sectionDays] = await Promise.all([
      this.prisma.userActivityMinute.deleteMany({
        where: { minute: { lt: cutoff } },
      }),
      this.prisma.userSectionDay.deleteMany({
        where: { day: { lt: cutoff } },
      }),
    ]);

    if (minutes.count > 0 || sectionDays.count > 0) {
      this.logger.log(
        `swept ${minutes.count} activity minute(s) and ${sectionDays.count} section day(s) older than ${ACTIVITY_RETENTION_DAYS}d`,
      );
    }
    return {
      deletedMinutes: minutes.count,
      deletedSectionDays: sectionDays.count,
    };
  }
}
