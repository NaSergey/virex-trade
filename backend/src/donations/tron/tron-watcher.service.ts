import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Prisma, TronIncomingTransfer } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { formatUsdt } from '../amount';
import { DONATION_CONFIG, DonationConfig } from '../donation.config';
import { DonationsService } from '../donations.service';
import {
  Trc20Transfer,
  TronGridClient,
  TronGridError,
} from './trongrid.client';

const CURSOR_ID = 'usdt-trc20';
/**
 * Насколько назад отматывается водяной знак после каждого прохода. Перекрытие
 * дешёвое (повтор ловит уникальный ключ журнала) и закрывает две вещи:
 * подтверждение блока задним числом относительно нашего времени и расхождение
 * часов между нами и индексатором.
 */
const CURSOR_LAG_MS = 10 * 60_000;
/** Сколько истории смотреть при самом первом запуске. */
const FIRST_RUN_LOOKBACK_MS = 60 * 60_000;
/** Предел страниц за один проход — чтобы один тик не читал историю вечно. */
const MAX_PAGES_PER_TICK = 10;
/** Пауза после отказа API удваивается до этого потолка. */
const MAX_BACKOFF_MS = 5 * 60_000;

/**
 * Наблюдатель за блокчейном: опрос TronGrid раз в POLL_INTERVAL, разбор
 * входящих USDT-переводов, сопоставление с интентами, уборка просроченных.
 *
 * ── Почему опрос, а не вебхук ──
 * Вебхук требует публичного HTTPS-адреса, проверки подписи, защиты от
 * повторов и внешнего сервиса, который придётся оплачивать и чинить, когда он
 * замолчит. Опрос раз в 15 секунд — один HTTP-запрос, ~5 800 запросов в сутки,
 * что укладывается в бесплатную квоту TronGrid, и работает из-за NAT, с
 * ноутбука и из Docker без единой сетевой настройки. Задержка обнаружения
 * при этом растёт максимум на период опроса — на фоне минуты финализации
 * блока это ничего не меняет. Для проекта такого размера опрос строго лучше.
 *
 * ── Почему у платежа нет «получателя по адресу» ──
 * Кошелёк один, и опознать плательщика по адресу назначения нельзя в принципе.
 * По адресу отправителя — тоже: он неизвестен заранее, а у платящего с биржи
 * это вообще адрес горячего кошелька биржи, общий на тысячи людей. Memo в
 * TRC20-переводе не существует как поле: у TRON комментарий есть только у
 * нативных TRX-переводов, и до контракта USDT он не доезжает. Остаётся сумма —
 * и она же делается идентификатором (см. amount.ts).
 */
@Injectable()
export class TronWatcherService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TronWatcherService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopped = false;
  private backoffUntil = 0;
  private failures = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: TronGridClient,
    private readonly donations: DonationsService,
    @Inject(DONATION_CONFIG) private readonly config: DonationConfig,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.enabled) {
      this.logger.log(
        'DONATION_TRON_ADDRESS не задан или не проходит проверку — приём донатов выключен',
      );
      return;
    }
    this.logger.log(
      `слежу за ${this.config.receivingAddress} (USDT ${this.config.usdtContract}), ` +
        `опрос раз в ${Math.round(this.config.pollIntervalMs / 1000)}с`,
    );
    void this.tick();
    this.timer = setInterval(
      () => void this.tick(),
      this.config.pollIntervalMs,
    );
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Один проход. Ошибки не выпускаются наружу: это фоновый цикл, и падение
   * одного тика не должно ни ронять процесс, ни останавливать следующий.
   */
  async tick(): Promise<void> {
    if (this.running || this.stopped) return;
    if (Date.now() < this.backoffUntil) return;
    this.running = true;
    try {
      await this.donations.expirePending();
      await this.donations.releaseStaleLocks();
      await this.retryPending();
      await this.scan();
      this.failures = 0;
    } catch (e) {
      this.onFailure(e);
    } finally {
      this.running = false;
    }
  }

  private onFailure(e: unknown) {
    this.failures += 1;
    const wait = Math.min(
      this.config.pollIntervalMs * 2 ** this.failures,
      MAX_BACKOFF_MS,
    );
    this.backoffUntil = Date.now() + wait;
    const detail = e instanceof TronGridError ? e.message : String(e);
    // Курсор при отказе не двигается — пропустить платёж это не даёт, только
    // отложить его обнаружение.
    this.logger.warn(
      `опрос TRON не удался (${detail}); следующая попытка через ${Math.round(wait / 1000)}с`,
    );
  }

  // ── Опрос ──

  private async scan(): Promise<void> {
    const cursor = await this.readCursor();
    let fingerprint: string | null = null;
    let maxSeen = cursor;
    let pages = 0;

    do {
      const page = await this.client.fetchIncomingUsdt({
        minTimestampMs: cursor,
        limit: 200,
        fingerprint,
      });
      for (const transfer of page.transfers) {
        maxSeen = Math.max(maxSeen, transfer.blockTimestamp);
        await this.ingest(transfer);
      }
      fingerprint = page.nextFingerprint;
      pages += 1;
      // Пустая страница закрывает проход: у TronGrid fingerprint приходит и
      // тогда, когда данных больше нет, и слепое следование за ним
      // закольцевало бы опрос.
      if (page.transfers.length === 0) break;
    } while (fingerprint && pages < MAX_PAGES_PER_TICK);

    // Водяной знак двигается вперёд с запасом назад. Если страниц было больше
    // предела, курсор остаётся на месте — хвост дочитается следующим тиком.
    if (pages < MAX_PAGES_PER_TICK) {
      const next = Math.max(
        cursor,
        Math.min(Date.now(), maxSeen) - CURSOR_LAG_MS,
      );
      await this.writeCursor(next);
    }
  }

  private async readCursor(): Promise<number> {
    const row = await this.prisma.tronScanCursor.findUnique({
      where: { id: CURSOR_ID },
    });
    if (row) return row.lastScannedAt.getTime();
    const start = Date.now() - FIRST_RUN_LOOKBACK_MS;
    await this.prisma.tronScanCursor.create({
      data: { id: CURSOR_ID, lastScannedAt: new Date(start) },
    });
    return start;
  }

  private async writeCursor(ms: number): Promise<void> {
    await this.prisma.tronScanCursor.upsert({
      where: { id: CURSOR_ID },
      create: { id: CURSOR_ID, lastScannedAt: new Date(ms) },
      update: { lastScannedAt: new Date(ms) },
    });
  }

  // ── Разбор одного перевода ──

  /**
   * Перевод сначала ЗАПИСЫВАЕТСЯ в журнал и только потом разбирается.
   *
   * Порядок важен: уникальный ключ (txId, from, value) — это и есть
   * идемпотентность. Опрос видит один и тот же перевод десятки раз (перекрытие
   * курсора, повтор после сбоя, второй экземпляр приложения), и защита от
   * повторного зачисления должна стоять в БД, а не в памяти процесса.
   *
   * Строка создаётся в статусе NEW: упасть между записью и разбором можно, и
   * тогда следующий тик подберёт её в `retryPending`.
   */
  private async ingest(transfer: Trc20Transfer): Promise<void> {
    let row: TronIncomingTransfer;
    try {
      row = await this.prisma.tronIncomingTransfer.create({
        data: {
          txId: transfer.txId,
          fromAddress: transfer.from,
          toAddress: transfer.to,
          contractAddress: transfer.contract,
          valueUnits: transfer.valueUnits,
          blockTimestamp: new Date(transfer.blockTimestamp),
          status: 'NEW',
          raw: transfer.raw as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        return; // уже видели — второй раз не считаем
      }
      throw e;
    }
    await this.process(row);
  }

  /** Разбор строк журнала, оставшихся в NEW после сбоя. */
  private async retryPending(): Promise<void> {
    const rows = await this.prisma.tronIncomingTransfer.findMany({
      where: { status: 'NEW' },
      orderBy: { blockTimestamp: 'asc' },
      take: 50,
    });
    for (const row of rows) await this.process(row);
  }

  private async process(row: TronIncomingTransfer): Promise<void> {
    const claim = await this.donations.claimByAmount({
      valueUnits: row.valueUnits,
      txId: row.txId,
      fromAddress: row.fromAddress,
      blockTimestamp: row.blockTimestamp,
    });

    if (!claim) {
      // Деньги пришли, но не совпали ни с одним живым интентом: перевод «на
      // круглую сумму» мимо формы, недоплата, переплата, платёж после запаса
      // на подтверждение. Молча терять такое нельзя — строка остаётся в
      // журнале сверки и видна владельцу.
      await this.prisma.tronIncomingTransfer.update({
        where: { id: row.id },
        data: { status: 'UNMATCHED', processedAt: new Date() },
      });
      this.logger.warn(
        `входящий USDT без интента: ${formatUsdt(row.valueUnits)} от ${row.fromAddress} (${row.txId})`,
      );
      return;
    }

    await this.prisma.tronIncomingTransfer.update({
      where: { id: row.id },
      data: {
        status: 'MATCHED',
        donationId: claim.donationId,
        processedAt: new Date(),
      },
    });
    this.logger.log(
      `донат оплачен: ${formatUsdt(row.valueUnits)} USDT, интент ${claim.donationId}`,
    );
    await this.donations.sendThanks(claim.donationId);
  }
}
