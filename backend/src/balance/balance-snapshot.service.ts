import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExchangeRegistry } from '../exchanges/exchange-registry.service';
import { CredentialsService } from '../credentials/credentials.service';
import { detectGap, sumFlows, type Flow } from './balance-chain';
import { loadFlows } from './flows';

const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000;
/** Из Task 1: доля баланса, ниже которой расхождение — округление биржи. */
const GAP_TOLERANCE_PCT = 0.05;

/**
 * Биржи, у которых getBalance включает нереализованный PnL (см. «Разведка
 * адаптеров» в спеке). У них якорь снимается только на плоском счёте: иначе
 * он дышит вместе с рынком, и каждое движение цены по открытой позиции код
 * прочитает как ввод или вывод средств.
 *
 * MEXC включён, хотя вывод по нему собран из двух источников, а не из прямой
 * цитаты: цена ошибки несимметрична. Ложно исключить биржу отсюда — значит
 * показать пользователю выдуманные пополнения; ложно включить — эпизодически
 * пропустить часовой тик, что дешевле.
 */
const ANCHOR_REQUIRES_FLAT = new Set<string>(['okx', 'bitget', 'kucoin', 'mexc']);

/**
 * Часовые якоря ряда баланса.
 *
 * Раз в час, не раз в минуту: 1440 строк в сутки на пользователя не дают
 * ничего сверх вывода по цепочке сделок. И не раз в сутки: якорь должен быть
 * достаточно частым, чтобы пополнение локализовалось в узкое окно, а не
 * размазалось по дню.
 */
@Injectable()
export class BalanceSnapshotService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BalanceSnapshotService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly exchanges: ExchangeRegistry,
    private readonly credentials: CredentialsService,
  ) {}

  onApplicationBootstrap(): void {
    this.captureAll().catch((e) => this.logger.error('initial balance capture failed', e));
    this.timer = setInterval(() => {
      this.captureAll().catch((e) => this.logger.error('periodic balance capture failed', e));
    }, SNAPSHOT_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async captureAll(at = new Date()): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { activeExchange: { not: null } },
      select: { id: true },
    });
    for (const u of users) {
      // Провал у одного пользователя не должен ронять обход остальных —
      // тот же приём, что в TradeSyncService.syncAll.
      try {
        await this.captureFor(u.id, at);
      } catch (e) {
        this.logger.warn(`balance capture failed for user ${u.id}: ${e}`);
      }
    }
  }

  /**
   * Якорь одного пользователя.
   *
   * Публичный и принимает момент параметром: так его можно позвать вручную
   * после подключения биржи и прогнать в тесте без таймера и без часов.
   */
  async captureFor(userId: string, at = new Date()): Promise<'written' | 'skipped' | 'failed'> {
    const active = await this.credentials.getActive(userId);
    if (!active) return 'skipped';
    const { exchange, credentials: creds } = active;
    const adapter = this.exchanges.get(exchange);

    // Открытая позиция делает баланс непригодным для якоря на биржах,
    // возвращающих его вместе с нереализованным PnL: такой якорь дышит
    // вместе с рынком, и каждый вдох прочитается как ввод средств. Пропуск
    // безопасен — дыру закроет вывод по цепочке сделок.
    if (ANCHOR_REQUIRES_FLAT.has(exchange)) {
      const open = await adapter.getOpenPositions(creds);
      if (!open.success) return 'failed';
      if (open.positions.some((p) => Number(p.size) !== 0)) return 'skipped';
    }

    const res = await adapter.getBalance(creds);
    if (!res.success) return 'failed';
    const balance = res.balance;

    const prev = await this.prisma.balanceSnapshot.findFirst({
      where: { userId, exchange, at: { lt: at } },
      orderBy: { at: 'desc' },
    });

    // Первый якорь сравнивать не с чем: разрыва нет, а не «нулевой разрыв».
    let gap: number | null = null;
    if (prev) {
      const flows = await loadFlows(this.prisma, userId, exchange, prev.at, at);
      const expected = prev.balance + sumFlows(flows, prev.at, at);
      gap = detectGap(expected, balance, (Math.abs(balance) * GAP_TOLERANCE_PCT) / 100);
    }

    await this.prisma.balanceSnapshot.create({
      data: { userId, exchange, at, balance, source: 'snapshot', gap },
    });
    return 'written';
  }
}
