import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Счётчик SQL-запросов Prisma за флагом `PRISMA_LOG_QUERIES` — временная
 * измерительная инфраструктура T1
 * (`docs/superpowers/specs/2026-09-16-backend-optimization.md`). Питает
 * `scripts/load-baseline.ts` и временный лог в `TradeSyncService.syncAll`:
 * без числа запросов «стало быстрее» в следующих задачах спеки не с чем
 * сравнивать. Когда флаг не выставлен — обычный PrismaClient без
 * event-логирования, поведение и стоимость запроса не меняются.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private _queryCount = 0;

  constructor() {
    super(
      process.env.PRISMA_LOG_QUERIES
        ? { log: [{ emit: 'event', level: 'query' }] }
        : undefined,
    );
    if (process.env.PRISMA_LOG_QUERIES) {
      // Generic Prisma typings only expose `$on('query', …)` when the client
      // is parametrized with that log config at the type level; casting here
      // keeps PrismaService's own type (used everywhere via DI) untouched.
      (this as unknown as { $on(event: 'query', cb: () => void): void }).$on(
        'query',
        () => {
          this._queryCount++;
        },
      );
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Запросов с последнего resetQueryCount() (0, если PRISMA_LOG_QUERIES не
   * выставлен). Счётчик один на процесс, не на запрос/вызов: если флаг
   * случайно останется включён на многопользовательском сервере, число
   * будет включать запросы всех параллельных HTTP-запросов, а не только
   * измеряемого вызова. Годится для однопоточного скрипта (load-baseline.ts)
   * и локальной отладки — не для прод-метрики без изоляции по запросу.
   */
  get queryCount(): number {
    return this._queryCount;
  }

  resetQueryCount(): void {
    this._queryCount = 0;
  }
}
