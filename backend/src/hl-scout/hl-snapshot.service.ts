import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { runsBackgroundJobs } from '../role';
import {
  hlInfo,
  hlPausedFor,
  isGateRefusal,
  WEIGHT,
} from '../hyperliquid/hl-gate';
import { exposureOf, type SnapshotPosition } from './exposure';
import { positionsOf } from './positions';
import { SNAPSHOT_EVERY_MS, SNAPSHOT_KEEP_DAYS } from './criteria';
import type { ClearinghouseState } from './hl-types';

/** Как часто проверять, не пора ли снимок: сам снимок — раз в полчаса. */
const CHECK_EVERY_MS = 5 * 60_000;

/**
 * История позиций отобранных и сохранённых кошельков — фоновый сервис `worker`.
 *
 * Зачем: гипотеза владельца «успешные кошельки сидят в сторону, куда пойдёт цена»
 * проверяется только вперёд. Сегодняшний снимок ничего не доказывает — нужен ряд:
 * в момент T кошельки смотрели вот так, а цена после T пошла вот так. Поэтому
 * каждый проход пишет по строке на кошелёк (`HlPositionSnapshot`), а не агрегат
 * по монетам: когда появятся новые разрезы (по стилю, по размеру), историю не
 * придётся собирать заново.
 *
 * Срок прохода выводится из `max(at)`, а не из памяти процесса — как у отбора.
 */
@Injectable()
export class HlSnapshotService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(HlSnapshotService.name);
  private stopped = false;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (!runsBackgroundJobs()) return;
    void this.loop();
  }

  onModuleDestroy() {
    this.stopped = true;
  }

  private async loop() {
    while (!this.stopped) {
      try {
        // На паузе после 429 любой запрос её только продлил бы.
        if (hlPausedFor() === 0) await this.runIfDue(Date.now());
      } catch (e) {
        this.logger.error(`снимок позиций упал: ${(e as Error).message}`);
      }
      await new Promise<void>((resolve) =>
        setTimeout(resolve, CHECK_EVERY_MS).unref(),
      );
    }
  }

  async runIfDue(now: number): Promise<void> {
    const last = await this.prisma.hlPositionSnapshot.aggregate({
      _max: { at: true },
    });
    const lastAt = last._max.at?.getTime();
    if (lastAt != null && now - lastAt < SNAPSHOT_EVERY_MS) return;

    const at = new Date(now);
    // Те, чьи позиции интересны: прошедшие отбор (в таблице) и сохранённые.
    const wallets = await this.prisma.hlWallet.findMany({
      where: {
        hiddenAt: null,
        OR: [{ candidate: true, qualified: true }, { savedAt: { not: null } }],
      },
      select: { address: true, accountValue: true },
    });

    const rows: Prisma.HlPositionSnapshotCreateManyInput[] = [];
    const exposures: { address: string; net: number; gross: number }[] = [];
    for (const w of wallets) {
      try {
        const state = await hlInfo<ClearinghouseState>(
          { type: 'clearinghouseState', user: w.address },
          WEIGHT.clearinghouseState,
        );
        const positions: SnapshotPosition[] = positionsOf(w.address, state).map(
          (p) => ({
            coin: p.coin,
            szi: p.side === 'long' ? p.size : -p.size,
            notional: p.notional,
            entryPx: p.entryPx,
            upnl: p.unrealizedPnl,
          }),
        );
        rows.push({
          at,
          address: w.address,
          equity: w.accountValue,
          positions: positions as unknown as Prisma.InputJsonValue,
        });
        const e = exposureOf(positions, w.accountValue);
        if (e) exposures.push({ address: w.address, ...e });
      } catch (e) {
        // Шлюз отказал — дальше то же самое, дособираем завтра; собранное не теряем.
        if (isGateRefusal(e)) break;
        this.logger.warn(
          `снимок ${w.address} не удался: ${(e as Error).message}`,
        );
      }
    }

    if (rows.length > 0) {
      await this.prisma.hlPositionSnapshot.createMany({ data: rows });
      // Экспозиция в кошельке — для таблицы и фильтра «направленные»; история — в снимках.
      await this.prisma.$transaction(
        exposures.map((e) =>
          this.prisma.hlWallet.updateMany({
            where: { address: e.address },
            data: {
              netExposure: e.net,
              grossExposure: e.gross,
              exposureAt: at,
            },
          }),
        ),
      );
    }
    await this.prisma.hlPositionSnapshot.deleteMany({
      where: { at: { lt: new Date(now - SNAPSHOT_KEEP_DAYS * 86_400_000) } },
    });
    this.logger.log(
      `снимок позиций Hyperliquid: ${rows.length} из ${wallets.length} кошельков`,
    );
  }
}
