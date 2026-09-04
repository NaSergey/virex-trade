import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, Donation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import {
  candidateAmounts,
  formatUsdt,
  MAX_TAIL_UNITS,
  parseUsdtAmount,
} from './amount';
import { DONATION_CONFIG, DonationConfig } from './donation.config';
import { CLAIMABLE_STATUSES, DonationStatus } from './donation-status';
import { PaymentQrService } from './payment-qr.service';

/** Донат, каким его видит клиент. BigInt наружу не отдаётся — только строки. */
export interface DonationView {
  id: string;
  status: DonationStatus;
  currency: string;
  network: string;
  receivingAddress: string;
  /** Что человек попросил: «5.00». */
  requestedAmount: string;
  /** Что нужно перевести — ровно это, до последнего знака: «5.0043». */
  expectedAmount: string;
  /** Насколько expectedAmount больше requestedAmount: «0.0043». */
  amountSurcharge: string;
  paidAmount: string | null;
  transactionHash: string | null;
  fromAddress: string | null;
  createdAt: string;
  expiresAt: string;
  /** Сколько секунд осталось на оплату; 0 у всего, что уже не PENDING. */
  secondsLeft: number;
  paidAt: string | null;
  paidAfterExpiry: boolean;
  explorerUrl: string | null;
}

export interface DonationCreated extends DonationView {
  /** Содержимое QR: адрес (или платёжная ссылка — см. PaymentQrService). */
  qrPayload: string;
  /** PNG data:URL. null — генерация не удалась, платёж возможен по адресу. */
  qrDataUrl: string | null;
}

const TRONSCAN_TX = 'https://tronscan.org/#/transaction/';

/**
 * Жизненный цикл доната: создать интент, отдать реквизиты, показать статус,
 * закрыть по истечении срока. Поиском платежа в сети занимается
 * TronWatcherService — он же и вызывает сюда `claimByAmount`.
 */
@Injectable()
export class DonationsService {
  private readonly logger = new Logger(DonationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly qr: PaymentQrService,
    @Inject(DONATION_CONFIG) private readonly config: DonationConfig,
  ) {}

  /** Что нужно интерфейсу до нажатия кнопки. */
  /**
   * Сколько собрано за всё время — сумма подтверждённых донатов.
   *
   * Считается по `paidUnits`, а не по `expectedUnits`: засчитывается ровно то,
   * что пришло на кошелёк. Складывается в BigInt на стороне приложения, а не
   * через `aggregate`: Prisma отдаёт сумму BigInt-колонки как Decimal, и
   * точность, ради которой единицы и хранятся целыми, там теряется.
   */
  private async totalRaisedUnits(): Promise<bigint> {
    const rows = await this.prisma.donation.findMany({
      where: { status: 'PAID' satisfies DonationStatus, paidUnits: { not: null } },
      select: { paidUnits: true },
    });
    return rows.reduce((sum, r) => sum + (r.paidUnits ?? 0n), 0n);
  }

  async publicConfigWithTotal() {
    const [config, totalUnits] = await Promise.all([
      Promise.resolve(this.publicConfig()),
      this.totalRaisedUnits(),
    ]);
    return { ...config, totalRaised: formatUsdt(totalUnits) };
  }

  publicConfig() {
    return {
      enabled: this.config.enabled,
      currency: 'USDT',
      network: 'TRC20',
      receivingAddress: this.config.enabled
        ? this.config.receivingAddress
        : null,
      minAmount: formatUsdt(this.config.minUnits),
      maxAmount: formatUsdt(this.config.maxUnits),
      ttlSeconds: Math.floor(this.config.ttlMs / 1000),
      /** Максимум, на который сервер поднимет сумму ради уникального хвоста. */
      maxSurcharge: formatUsdt(MAX_TAIL_UNITS),
    };
  }

  // ── Создание интента ──

  async create(
    userId: string | null,
    amount: string,
    note?: string,
  ): Promise<DonationCreated> {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException({
        code: 'DONATIONS_DISABLED',
        message: 'Приём донатов не настроен',
      });
    }

    const requestedUnits = parseUsdtAmount(amount);
    if (requestedUnits == null) {
      throw new BadRequestException({
        code: 'DONATION_AMOUNT_INVALID',
        message:
          'Сумма должна быть числом не более чем с двумя знаками после запятой',
      });
    }
    if (
      requestedUnits < this.config.minUnits ||
      requestedUnits > this.config.maxUnits
    ) {
      throw new BadRequestException({
        code: 'DONATION_AMOUNT_RANGE',
        message: `Сумма доната — от ${formatUsdt(this.config.minUnits)} до ${formatUsdt(
          this.config.maxUnits,
        )} USDT`,
      });
    }

    // Своё же окно оплаты, открытое пятнадцать раз, съедает слоты сумм и
    // засоряет сверку. Ограничение на живые интенты — не про безопасность
    // денег, а про то, чтобы пул сумм не выкупил один нетерпеливый человек.
    if (userId) {
      const pending = await this.prisma.donation.count({
        where: { userId, status: 'PENDING', expiresAt: { gt: new Date() } },
      });
      if (pending >= this.config.maxPendingPerUser) {
        throw new BadRequestException({
          code: 'DONATION_TOO_MANY_PENDING',
          message:
            'Уже открыто несколько неоплаченных донатов — завершите или отмените их',
        });
      }
    }

    const now = Date.now();
    const expiresAt = new Date(now + this.config.ttlMs);
    const matchUntil = new Date(
      now + this.config.ttlMs + this.config.lateGraceMs,
    );
    const donation = await this.createWithFreeAmount(
      userId,
      requestedUnits,
      expiresAt,
      matchUntil,
      note,
    );

    return {
      ...this.toView(donation),
      qrPayload: this.qr.buildPayload(donation.expectedUnits),
      qrDataUrl: await this.qr.buildDataUrl(donation.expectedUnits),
    };
  }

  /**
   * Выдача суммы с уникальным хвостом.
   *
   * Свободный хвост НЕ выбирается запросом «какие заняты» с последующей
   * вставкой: между этими двумя действиями другой запрос успевает занять тот
   * же хвост, и два человека получают одну сумму — ровно та ошибка, ради
   * которой всё это и строится. Уникальность обеспечивает первичный ключ
   * `donation_amount_locks.expectedUnits`: попытка занять занятое падает
   * P2002, и мы честно берём следующий кандидат. Кандидаты перемешаны —
   * последовательный перебор при живой очереди выродился бы в линейный поиск.
   */
  private async createWithFreeAmount(
    userId: string | null,
    requestedUnits: bigint,
    expiresAt: Date,
    matchUntil: Date,
    note?: string,
  ): Promise<Donation> {
    // Освобождаем просроченные слоты до попытки — иначе пул сумм со временем
    // «зарастает» строками мёртвых интентов.
    await this.releaseStaleLocks();

    const attempts = candidateAmounts(requestedUnits);
    for (const expectedUnits of attempts) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const donation = await tx.donation.create({
            data: {
              userId,
              status: 'PENDING',
              currency: 'USDT',
              network: 'TRC20',
              receivingAddress: this.config.receivingAddress,
              requestedUnits,
              expectedUnits,
              note: note ?? null,
              expiresAt,
              matchUntil,
            },
          });
          await tx.donationAmountLock.create({
            data: {
              expectedUnits,
              donationId: donation.id,
              heldUntil: matchUntil,
            },
          });
          return donation;
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          continue; // хвост заняли раньше — берём следующий
        }
        throw e;
      }
    }

    // Сюда попадают, только если заняты ВСЕ хвосты этой базы — то есть на ту
    // же самую сумму живёт под сотню неоплаченных интентов. Это либо всплеск,
    // либо злоупотребление; и то и другое лечится ожиданием, а не выдачей
    // неуникальной суммы: неуникальная сумма — это чужой донат, засчитанный
    // не тому.
    this.logger.error(
      `не удалось выдать уникальную сумму для ${formatUsdt(requestedUnits)} USDT`,
    );
    throw new ServiceUnavailableException({
      code: 'DONATION_AMOUNT_POOL_EXHAUSTED',
      message:
        'Слишком много одновременных платежей на эту сумму — попробуйте через минуту',
    });
  }

  // ── Чтение ──

  async get(id: string, userId: string | null): Promise<DonationView> {
    const donation = await this.prisma.donation.findUnique({ where: { id } });
    if (!donation) throw new NotFoundException('Донат не найден');
    // Донат анонима принадлежит тому, у кого есть его id (uuid из ответа
    // сервера, ни в каком списке он не светится). Донат авторизованного
    // читает только он сам: сумма и хеш транзакции — это его платёжные данные.
    if (donation.userId && donation.userId !== userId) {
      throw new ForbiddenException('Чужой донат');
    }
    return this.toView(donation);
  }

  async listMine(userId: string, limit = 20): Promise<DonationView[]> {
    const rows = await this.prisma.donation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return rows.map((d) => this.toView(d));
  }

  /**
   * Отмена окна оплаты. Ничего не «отменяет» в сети — перевод, уже ушедший в
   * блокчейн, отозвать нельзя, поэтому сумма остаётся закреплённой за интентом
   * до matchUntil: заплативший в последний момент всё равно получит зачёт.
   */
  async cancel(id: string, userId: string | null): Promise<DonationView> {
    const donation = await this.prisma.donation.findUnique({ where: { id } });
    if (!donation) throw new NotFoundException('Донат не найден');
    if (donation.userId && donation.userId !== userId) {
      throw new ForbiddenException('Чужой донат');
    }
    if (donation.status !== 'PENDING') return this.toView(donation);

    const updated = await this.prisma.donation.update({
      where: { id },
      data: { status: 'CANCELED' },
    });
    return this.toView(updated);
  }

  // ── Сопоставление платежа (вызывает TronWatcherService) ──

  /**
   * Засчитать перевод интенту с такой же суммой.
   *
   * Три независимых замка стоят на пути двойного зачисления:
   *  1) `updateMany` с условием `transactionHash: null` — атомарный
   *     compare-and-set: перевод занимает интент ровно один раз, даже если
   *     сюда одновременно зашли два процесса;
   *  2) уникальный индекс на `Donation.transactionHash` — одна транзакция не
   *     может быть засчитана двум интентам;
   *  3) уникальный ключ журнала `TronIncomingTransfer` — один и тот же перевод
   *     не будет разобран дважды (проверяется до вызова сюда).
   *
   * Возвращает id доната при успехе и null, если засчитывать нечему.
   */
  async claimByAmount(transfer: {
    valueUnits: bigint;
    txId: string;
    fromAddress: string;
    blockTimestamp: Date;
  }): Promise<{ donationId: string } | null> {
    const lock = await this.prisma.donationAmountLock.findUnique({
      where: { expectedUnits: transfer.valueUnits },
      include: { donation: true },
    });
    if (!lock || !lock.donation) return null;

    const donation = lock.donation;
    if (!CLAIMABLE_STATUSES.includes(donation.status as DonationStatus))
      return null;
    // Перевод, подтверждённый позже, чем сумма закреплена, не наш кандидат:
    // хвост к этому времени мог быть выдан заново.
    if (transfer.blockTimestamp > donation.matchUntil) return null;

    const paidAfterExpiry = transfer.blockTimestamp > donation.expiresAt;

    try {
      const res = await this.prisma.donation.updateMany({
        where: {
          id: donation.id,
          transactionHash: null,
          status: { in: [...CLAIMABLE_STATUSES] },
          expectedUnits: transfer.valueUnits,
        },
        data: {
          status: 'PAID',
          transactionHash: transfer.txId,
          fromAddress: transfer.fromAddress,
          paidUnits: transfer.valueUnits,
          transferredAt: transfer.blockTimestamp,
          detectedAt: new Date(),
          paidAfterExpiry,
        },
      });
      if (res.count !== 1) return null; // кто-то успел раньше
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        // Этот хеш уже засчитан другому интенту — считаем перевод разобранным.
        return null;
      }
      throw e;
    }

    // Слот суммы свободен: интент закрыт, и следующему донору хвост можно
    // выдать сразу, не дожидаясь matchUntil.
    await this.prisma.donationAmountLock
      .delete({ where: { expectedUnits: transfer.valueUnits } })
      .catch(() => undefined);

    return { donationId: donation.id };
  }

  /**
   * Благодарность отправляется ПОСЛЕ фиксации оплаты и отдельной операцией:
   * упавший Telegram не должен откатывать зачисление денег. Не дошло —
   * `notifiedAt` останется пустым, а статус в интерфейсе человек и так увидит.
   */
  async sendThanks(donationId: string): Promise<void> {
    const donation = await this.prisma.donation.findUnique({
      where: { id: donationId },
    });
    if (!donation || donation.status !== 'PAID' || donation.notifiedAt) return;

    if (donation.userId) {
      await this.telegram
        .notifyDonationReceived(donation.userId, {
          amount: formatUsdt(donation.paidUnits ?? donation.expectedUnits),
          txId: donation.transactionHash ?? '',
          late: donation.paidAfterExpiry,
        })
        .catch((e) => this.logger.warn(`благодарность не ушла: ${e}`));
    }

    await this.prisma.donation.update({
      where: { id: donation.id },
      data: { notifiedAt: new Date() },
    });
  }

  // ── Уборка ──

  /** Просроченные окна оплаты переводятся в EXPIRED одним запросом. */
  async expirePending(): Promise<number> {
    const res = await this.prisma.donation.updateMany({
      where: { status: 'PENDING', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
    return res.count;
  }

  /** Снимает закрепление сумм, чей запас на позднее подтверждение вышел. */
  async releaseStaleLocks(): Promise<number> {
    const res = await this.prisma.donationAmountLock.deleteMany({
      where: { heldUntil: { lt: new Date() } },
    });
    return res.count;
  }

  // ── Сверка для владельца ──

  /** Деньги, пришедшие на кошелёк и не подошедшие ни одному интенту. */
  async unmatchedTransfers(limit = 50) {
    const rows = await this.prisma.tronIncomingTransfer.findMany({
      where: { status: { in: ['UNMATCHED', 'DUPLICATE_TX'] } },
      orderBy: { blockTimestamp: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map((r) => ({
      id: r.id,
      txId: r.txId,
      from: r.fromAddress,
      amount: formatUsdt(r.valueUnits),
      at: r.blockTimestamp.toISOString(),
      status: r.status,
      explorerUrl: `${TRONSCAN_TX}${r.txId}`,
    }));
  }

  // ── Отображение ──

  private toView(d: Donation): DonationView {
    const secondsLeft =
      d.status === 'PENDING'
        ? Math.max(0, Math.ceil((d.expiresAt.getTime() - Date.now()) / 1000))
        : 0;
    return {
      id: d.id,
      status: d.status as DonationStatus,
      currency: d.currency,
      network: d.network,
      receivingAddress: d.receivingAddress,
      requestedAmount: formatUsdt(d.requestedUnits),
      expectedAmount: formatUsdt(d.expectedUnits),
      amountSurcharge: formatUsdt(d.expectedUnits - d.requestedUnits),
      paidAmount: d.paidUnits == null ? null : formatUsdt(d.paidUnits),
      transactionHash: d.transactionHash,
      fromAddress: d.fromAddress,
      createdAt: d.createdAt.toISOString(),
      expiresAt: d.expiresAt.toISOString(),
      secondsLeft,
      paidAt: d.detectedAt?.toISOString() ?? null,
      paidAfterExpiry: d.paidAfterExpiry,
      explorerUrl: d.transactionHash
        ? `${TRONSCAN_TX}${d.transactionHash}`
        : null,
    };
  }
}
