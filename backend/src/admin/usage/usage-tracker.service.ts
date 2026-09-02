import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { isTrackedPath, sectionOf } from './sections';
import { floorToDay, floorToMinute } from './visits';

const FLUSH_INTERVAL_MS = 30_000;

/**
 * Потолок на размер буфера. Упирается в него только патология — БД лежит долго,
 * а трафик идёт, — и тогда лучше потерять статистику посещений, чем память
 * процесса, который обслуживает торговый интерфейс.
 */
const MAX_BUFFERED_MINUTES = 20_000;

interface MinuteBucket {
  userId: string;
  minuteMs: number;
  requests: number;
  writes: number;
  sections: Map<string, { requests: number; writes: number }>;
}

/**
 * Засекает, что пользователь был в сервисе.
 *
 * Пишет не каждый запрос, а агрегат по минуте: интерфейс опрашивает позиции
 * каждые несколько секунд, и запись на запрос дала бы десятки тысяч строк в
 * день на человека ради данных, из которых всё равно берётся только «была ли
 * минута активной». Минуты потом сшиваются в визиты (usage-queries.ts).
 *
 * Копится в памяти и сбрасывается пачкой раз в {@link FLUSH_INTERVAL_MS}.
 * Сбрасываются только ЗАВЕРШЁННЫЕ минуты (строго раньше текущей) — так минута
 * уходит в БД ровно один раз, а не догружается вторым сбросом.
 *
 * Данные аналитические, поэтому надёжность здесь сознательно ниже, чем у
 * сделок: незаписанная из-за падения БД минута логируется и теряется, но не
 * ретраится бесконечно и никогда не роняет запрос пользователя.
 */
@Injectable()
export class UsageTrackerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(UsageTrackerService.name);
  private readonly buffer = new Map<string, MinuteBucket>();
  private timer?: NodeJS.Timeout;
  private overflowWarned = false;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      this.flush().catch((e) => this.logger.error('usage flush failed', e));
    }, FLUSH_INTERVAL_MS);
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    // На остановке текущая (незавершённая) минута тоже уходит в БД: иначе
    // рестарт посреди визита мог бы стереть его последнюю засечку.
    await this.flush(true).catch((e) =>
      this.logger.error('final usage flush failed', e),
    );
  }

  /**
   * Учесть один авторизованный запрос. Синхронный и без await по замыслу:
   * вызывается из интерсептора на каждом запросе и не должен добавлять
   * задержки к ответу.
   */
  record(userId: string, path: string, method: string, at = new Date()) {
    if (!isTrackedPath(path)) return;

    const minuteMs = floorToMinute(at).getTime();
    const key = `${userId}|${minuteMs}`;

    let bucket = this.buffer.get(key);
    if (!bucket) {
      if (this.buffer.size >= MAX_BUFFERED_MINUTES) {
        if (!this.overflowWarned) {
          this.logger.warn(
            `usage buffer hit ${MAX_BUFFERED_MINUTES} entries — dropping activity until it drains`,
          );
          this.overflowWarned = true;
        }
        return;
      }
      bucket = {
        userId,
        minuteMs,
        requests: 0,
        writes: 0,
        sections: new Map(),
      };
      this.buffer.set(key, bucket);
    }

    const isWrite =
      method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
    bucket.requests++;
    if (isWrite) bucket.writes++;

    const section = sectionOf(path);
    const sec = bucket.sections.get(section) ?? { requests: 0, writes: 0 };
    sec.requests++;
    if (isWrite) sec.writes++;
    bucket.sections.set(section, sec);
  }

  /**
   * @param force записать в том числе текущую, ещё не закрытую минуту.
   *   Только для остановки процесса: при обычном сбросе такая минута ещё
   *   набирает запросы, и записывать её рано.
   */
  async flush(force = false): Promise<{ written: number }> {
    const cutoff = floorToMinute(new Date()).getTime();
    const ready: MinuteBucket[] = [];

    for (const [key, bucket] of this.buffer) {
      if (force || bucket.minuteMs < cutoff) {
        ready.push(bucket);
        this.buffer.delete(key);
      }
    }
    if (ready.length === 0) return { written: 0 };
    this.overflowWarned = false;

    let written = 0;
    let failed = 0;
    for (const bucket of ready) {
      try {
        await this.persist(bucket);
        written++;
      } catch (e) {
        failed++;
        if (failed === 1)
          this.logger.warn(`usage minute dropped: ${(e as Error).message}`);
      }
    }
    if (failed > 0) {
      this.logger.warn(
        `usage flush lost ${failed} minute(s) of ${ready.length}`,
      );
    }

    return { written };
  }

  private async persist(bucket: MinuteBucket) {
    const minute = new Date(bucket.minuteMs);
    // День берётся в UTC: сдвиг часового пояса — вопрос чтения отчёта, и
    // применяется при выборке, а не при записи, иначе смена настройки
    // переписывала бы историю.
    const day = floorToDay(minute);

    await this.prisma.userActivityMinute.upsert({
      where: { userId_minute: { userId: bucket.userId, minute } },
      create: {
        userId: bucket.userId,
        minute,
        requests: bucket.requests,
        writes: bucket.writes,
      },
      update: {
        requests: { increment: bucket.requests },
        writes: { increment: bucket.writes },
      },
    });

    for (const [section, counts] of bucket.sections) {
      await this.prisma.userSectionDay.upsert({
        where: { userId_day_section: { userId: bucket.userId, day, section } },
        create: {
          userId: bucket.userId,
          day,
          section,
          requests: counts.requests,
          writes: counts.writes,
        },
        update: {
          requests: { increment: counts.requests },
          writes: { increment: counts.writes },
        },
      });
    }
  }
}
