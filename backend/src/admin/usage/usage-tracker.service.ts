import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isTrackedPath, sectionOf } from './sections';
import { floorToDay, floorToMinute } from './visits';
import { runsApiJobs } from '../../role';

const FLUSH_INTERVAL_MS = 30_000;

/**
 * Потолок на размер буфера.
 *
 * В штатном режиме в буфере лежит только ещё не закрытая минута — flush
 * каждые {@link FLUSH_INTERVAL_MS} забирает всё, что строго раньше текущей, —
 * то есть размер буфера ограничен числом одновременно активных
 * пользователей, а не длительностью простоя БД. Целевой потолок — 1000
 * онлайн (см. task-15-brief.md), ×3 запаса: текущая минута + разовый всплеск
 * (вебхуки, ретраи) + рост аудитории без немедленной правки константы.
 *
 * Раньше здесь стояло 20 000 — это не «только патология», как гласил старый
 * комментарий, а ровно 20 минут простоя БД при 1000 онлайн (1000 корзин на
 * минуту простоя). Столько памяти ради статистики посещений процессу, который
 * обслуживает торговый интерфейс, держать незачем: при затянувшемся сбое БД
 * лучше быстро начать терять точность аналитики (см. flush/persistBatch —
 * потеря уже логируется и не ретраится бесконечно), чем копить буфер часами.
 */
const MAX_BUFFERED_MINUTES = 3_000;

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
    // T11: интерсептор, вызывающий record(), живёт в api (там HTTP-трафик) —
    // сброс копится там же, а не в worker (см. task-11-brief.md). record()
    // в роли worker никто не вызовет, но и таймер там заводить незачем.
    if (!runsApiJobs()) return;
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

    return this.persistBatch(ready);
  }

  /**
   * Пишет всю пачку минут (500–1000+ корзин при 1000 онлайн) двумя запросами
   * вместо ~2.5 upsert'а на корзину — построчный вариант держал event loop
   * секундами на каждом сбросе (B2).
   *
   * Обе вставки — `INSERT ... ON CONFLICT DO UPDATE SET x = table.x +
   * EXCLUDED.x`, точный аналог построчного `upsert` с `increment`: если
   * строка есть — прибавить, если нет — создать. Значения идут только через
   * параметры tagged-template (`Prisma.sql`/`Prisma.join`), не конкатенацией
   * строк.
   */
  private async persistBatch(
    ready: MinuteBucket[],
  ): Promise<{ written: number }> {
    const minuteRows = ready.map((b) => ({
      userId: b.userId,
      minute: new Date(b.minuteMs),
      requests: b.requests,
      writes: b.writes,
    }));

    try {
      await this.prisma.$executeRaw`
        INSERT INTO "user_activity_minutes" ("userId", minute, requests, writes)
        VALUES ${Prisma.join(
          minuteRows.map(
            (r) =>
              Prisma.sql`(${r.userId}, ${r.minute}, ${r.requests}, ${r.writes})`,
          ),
        )}
        ON CONFLICT ("userId", minute)
        DO UPDATE SET
          requests = "user_activity_minutes".requests + EXCLUDED.requests,
          writes = "user_activity_minutes".writes + EXCLUDED.writes
      `;
    } catch (e) {
      // Аналитика не стоит того, чтобы ронять процесс: пачка минут теряется
      // и логируется, а не ретраится бесконечно (буфер под эти корзины уже
      // очищен в flush() до вызова persistBatch).
      this.logger.warn(
        `usage flush lost ${ready.length} minute(s): ${(e as Error).message}`,
      );
      return { written: 0 };
    }

    // Несколько корзин (разные минуты) одного пользователя могут попасть в
    // один и тот же (userId, day, section) — раскладку по разделам сначала
    // схлопываем в памяти, иначе один INSERT попытался бы дважды обновить ту
    // же строку по ON CONFLICT, а Postgres это запрещает.
    const bySection = new Map<
      string,
      {
        userId: string;
        day: Date;
        section: string;
        requests: number;
        writes: number;
      }
    >();
    for (const b of ready) {
      // День берётся в UTC: сдвиг часового пояса — вопрос чтения отчёта, и
      // применяется при выборке, а не при записи, иначе смена настройки
      // переписывала бы историю.
      const day = floorToDay(new Date(b.minuteMs));
      for (const [section, counts] of b.sections) {
        const key = `${b.userId}|${day.getTime()}|${section}`;
        const agg = bySection.get(key);
        if (agg) {
          agg.requests += counts.requests;
          agg.writes += counts.writes;
        } else {
          bySection.set(key, {
            userId: b.userId,
            day,
            section,
            requests: counts.requests,
            writes: counts.writes,
          });
        }
      }
    }

    if (bySection.size > 0) {
      const sectionRows = [...bySection.values()];
      try {
        await this.prisma.$executeRaw`
          INSERT INTO "user_section_days" ("userId", day, section, requests, writes)
          VALUES ${Prisma.join(
            sectionRows.map(
              (r) =>
                Prisma.sql`(${r.userId}, ${r.day}, ${r.section}, ${r.requests}, ${r.writes})`,
            ),
          )}
          ON CONFLICT ("userId", day, section)
          DO UPDATE SET
            requests = "user_section_days".requests + EXCLUDED.requests,
            writes = "user_section_days".writes + EXCLUDED.writes
        `;
      } catch (e) {
        // Минуты уже записаны (запрос выше прошёл) — теряется только разбивка
        // по разделам, а не факт визита.
        this.logger.warn(
          `usage section breakdown lost for this flush: ${(e as Error).message}`,
        );
      }
    }

    return { written: ready.length };
  }
}
