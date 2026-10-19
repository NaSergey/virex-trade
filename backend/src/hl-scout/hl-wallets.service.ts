import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { HlWallet } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hlInfo, WEIGHT } from '../hyperliquid/hl-gate';
import { positionsOf, type HlPosition } from './positions';
import type { ClearinghouseState } from './hl-types';

const ADDRESS = /^0x[0-9a-f]{40}$/;
/** Позиции сохранённых — вживую, но не чаще раза в 15 с на всех: вес 2 на кошелёк. */
const POSITIONS_TTL_MS = 15_000;

/** Живой — торговал за неделю или держит позицию. */
const ALIVE = { OR: [{ volumeWeek: { gt: 0 } }, { openPositions: { gt: 0 } }] };

export interface PositionsSnapshot {
  asOf: string;
  positions: HlPosition[];
  /** Кошельки, чьи позиции не загрузились: таблица без них — не «позиций нет». */
  failed: string[];
}

function rowOf(w: HlWallet) {
  return {
    address: w.address,
    accountValue: w.accountValue,
    pnlWeek: w.pnlWeek,
    pnlMonth: w.pnlMonth,
    pnl90: w.pnl90,
    pnlAllTime: w.pnlAllTime,
    roiMonth: w.roiMonth,
    weeks: w.weeks,
    weeksMoving: w.weeksMoving,
    weeksUp: w.weeksUp,
    bestWeekShare: w.bestWeekShare,
    maxDrawdown: w.maxDrawdown,
    volumeWeek: w.volumeWeek,
    openPositions: w.openPositions,
    analyzedAt: w.analyzedAt,
    qualified: w.qualified,
    rejectReason: w.rejectReason,
    alive: w.volumeWeek > 0 || (w.openPositions ?? 0) > 0,
    savedAt: w.savedAt,
    note: w.note,
    viewedAt: w.viewedAt,
  };
}

function addressOf(raw: string): string {
  const address = String(raw).toLowerCase();
  if (!ADDRESS.test(address))
    throw new BadRequestException({
      message: 'Не адрес кошелька',
      code: 'HL_BAD_ADDRESS',
    });
  return address;
}

/**
 * Страница владельца: таблица отбора, сохранённые кошельки и их позиции. Пишет
 * отбор бот (`HlScoutService`, роль worker); здесь только чтение и отметка
 * «сохранён».
 */
@Injectable()
export class HlWalletsService {
  private cache: { at: number; value: PositionsSnapshot } | null = null;
  private inflight: Promise<PositionsSnapshot> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Прошедшие и живые кандидаты последнего отбора и сводка бота над таблицей. */
  async list() {
    const [rows, last, candidates, analyzed] = await Promise.all([
      this.prisma.hlWallet.findMany({
        where: { candidate: true, hiddenAt: null, qualified: true, ...ALIVE },
        orderBy: { pnlMonth: 'desc' },
      }),
      this.prisma.hlWallet.aggregate({
        where: { candidate: true, hiddenAt: null },
        _max: { seenAt: true },
      }),
      this.prisma.hlWallet.count({
        where: { candidate: true, hiddenAt: null },
      }),
      this.prisma.hlWallet.count({
        where: { candidate: true, hiddenAt: null, analyzedAt: { not: null } },
      }),
    ]);
    return {
      status: {
        discoveredAt: last._max.seenAt,
        candidates,
        analyzed,
        qualified: rows.length,
      },
      rows: rows.map(rowOf),
    };
  }

  /** Сохранённые — все, и выпавшие из отбора тоже: причина видна в строке. */
  async saved() {
    const rows = await this.prisma.hlWallet.findMany({
      where: { savedAt: { not: null } },
      orderBy: { savedAt: 'desc' },
    });
    return { rows: rows.map(rowOf) };
  }

  /** Сохранить или сменить заметку. Повторное сохранение время не двигает. */
  async save(raw: string, note: string | undefined) {
    const address = addressOf(raw);
    const w = await this.prisma.hlWallet.findUnique({ where: { address } });
    if (!w)
      throw new NotFoundException({
        message: 'Кошелька нет в отборе',
        code: 'HL_WALLET_NOT_FOUND',
      });
    const updated = await this.prisma.hlWallet.update({
      where: { address },
      data: {
        savedAt: w.savedAt ?? new Date(),
        ...(note !== undefined ? { note: note.trim() || null } : {}),
      },
    });
    this.cache = null;
    return rowOf(updated);
  }

  /** Владелец открыл профиль кошелька: строка таблицы гаснет. Первое открытие время не двигает. */
  async markViewed(raw: string) {
    await this.prisma.hlWallet.updateMany({
      where: { address: addressOf(raw), viewedAt: null },
      data: { viewedAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * Удалить кошелёк из таблицы насовсем: строка остаётся меткой `hiddenAt`,
   * чтобы отбор не вернул его, а разбор не тратил на него запросы. Сохранённый
   * не удаляется — у него заметка, и стереть её одним кликом по ошибке нельзя.
   */
  async hide(raw: string) {
    const address = addressOf(raw);
    const w = await this.prisma.hlWallet.findUnique({ where: { address } });
    if (!w)
      throw new NotFoundException({
        message: 'Кошелька нет в отборе',
        code: 'HL_WALLET_NOT_FOUND',
      });
    if (w.savedAt)
      throw new BadRequestException({
        message: 'Сначала уберите кошелёк из сохранённых',
        code: 'HL_WALLET_SAVED',
      });
    await this.prisma.hlWallet.update({
      where: { address },
      data: { hiddenAt: w.hiddenAt ?? new Date() },
    });
    return { ok: true };
  }

  /**
   * Убрать из сохранённых. Заметка остаётся: «Сохранён ✓» снимается одним
   * кликом, и случайный клик не должен стирать написанное. Не-кандидата
   * следующий отбор удалит сам — вместе с заметкой.
   */
  async unsave(raw: string) {
    await this.prisma.hlWallet.updateMany({
      where: { address: addressOf(raw) },
      data: { savedAt: null },
    });
    this.cache = null;
    return { ok: true };
  }

  /**
   * Открытые позиции всех сохранённых — с Hyperliquid, а не из базы: бот
   * разбирает кошелёк раз в ~2 часа, а позиции смотрят, чтобы видеть их сейчас.
   * Запрос в пути общий: две вкладки вне кэша дали бы двойной залп по
   * бюджету `api` (вес 2 на кошелёк).
   */
  positions(now: number = Date.now()): Promise<PositionsSnapshot> {
    if (this.cache && now - this.cache.at < POSITIONS_TTL_MS)
      return Promise.resolve(this.cache.value);
    this.inflight ??= this.loadPositions(now).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async loadPositions(now: number): Promise<PositionsSnapshot> {
    const saved = await this.prisma.hlWallet.findMany({
      where: { savedAt: { not: null } },
      select: { address: true },
    });
    const states = await Promise.allSettled(
      saved.map(({ address }) =>
        hlInfo<ClearinghouseState>(
          { type: 'clearinghouseState', user: address },
          WEIGHT.clearinghouseState,
        ),
      ),
    );
    const positions: HlPosition[] = [];
    const failed: string[] = [];
    states.forEach((s, i) => {
      const { address } = saved[i];
      if (s.status === 'fulfilled')
        positions.push(...positionsOf(address, s.value));
      else failed.push(address);
    });
    const value = { asOf: new Date(now).toISOString(), positions, failed };
    this.cache = { at: now, value };
    return value;
  }
}
