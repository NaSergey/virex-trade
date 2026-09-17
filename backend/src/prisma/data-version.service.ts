import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Версия данных пользователя (T10, backend-optimization) — счётчик,
 * растущий при любой правке того, что видят агрегаты сделок
 * (`TradesService.stats/statsByTime/statsByTag/statsByTagCombo/list`,
 * `LabService.query`, `HabitsService.scan`). Читатели строят по ней ключ
 * LRU-кэша (`aggregate-cache.ts`) и `ETag`; писатели поднимают её из мест,
 * где эти данные реально меняются — полный список точек с обоснованием
 * каждой в `docs/superpowers/sdd/2026-09-16-backend-optimization/task-10-report.md`.
 *
 * Живёт в `prisma/`, а не в `trades/`: точки подъёма версии разбросаны по
 * нескольким модулям (`trades`, `tags`), которые не должны знать друг о
 * друге, а `PrismaModule` уже `@Global` и доступен отовсюду без лишних
 * импортов — ровно то, что нужно общему для модулей счётчику.
 */
@Injectable()
export class DataVersionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Дешёвое чтение одной колонки по первичному ключу — единственный запрос,
   * которым обходится и построение ETag, и сравнение с `If-None-Match` на
   * "данные не менялись" пути (без похода к самому агрегату).
   */
  async get(userId: string): Promise<number> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { dataVersion: true },
    });
    return row?.dataVersion ?? 0;
  }

  /**
   * Атомарный инкремент через SQL `SET "dataVersion" = "dataVersion" + 1`, а
   * не read-modify-write в приложении (прочитать → +1 → записать): два
   * конкурентных бампа (например, тик периодического синка и одновременная
   * правка тега пользователем) иначе могли бы потерять один из инкрементов —
   * оба читают одно и то же старое значение и оба пишут его+1.
   */
  async bump(userId: string): Promise<void> {
    await this.prisma.$executeRaw`UPDATE "users" SET "dataVersion" = "dataVersion" + 1 WHERE "id" = ${userId}`;
  }
}
