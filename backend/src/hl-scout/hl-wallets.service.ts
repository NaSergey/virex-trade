import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { HlWallet } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hlInfo, WEIGHT } from '../hyperliquid/hl-gate';
import { positionsOf, type HlPosition } from './positions';
import { ordersOf, type HlOrder } from './activity';
import { tradesOf } from './trades';
import type { ClearinghouseState, RawFill, RawOpenOrder } from './hl-types';

const ADDRESS = /^0x[0-9a-f]{40}$/;
/** Позиции сохранённых — вживую, но не чаще раза в 15 с на всех: вес 2 на кошелёк. */
const POSITIONS_TTL_MS = 15_000;
/**
 * Ордера и сделки сохранённого кошелька — по открытию вкладки, а не опросом.
 * `userFills` у Hyperliquid тяжёлый (вес растёт с числом строк), поэтому ответ
 * держится минуту и общий на всех обращающихся.
 */
const ACTIVITY_TTL_MS = 60_000;
/** Время открытия позиции не меняется, пока она держится, — повторно ищем не чаще, чем раз в две минуты. */
const OPENED_RETRY_MS = 120_000;

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
    starred: w.starredAt != null,
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
  /** Время открытия позиций по кошельку и монете — пока позиция держится, оно то же. */
  private readonly opened = new Map<
    string,
    Map<string, { at: number | null; partial: boolean; side: 'long' | 'short' }>
  >();
  private readonly openedTried = new Map<string, number>();
  private resolving: Promise<void> | null = null;
  private readonly activity = new Map<
    string,
    { at: number; value: Promise<unknown> }
  >();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Прошедшие и живые кандидаты последнего отбора и сводка бота над таблицей.
   * Сохранённые сюда не попадают: взятый в работу кошелёк переезжает на «Сохранённые».
   */
  async list() {
    const [rows, last, candidates, analyzed] = await Promise.all([
      this.prisma.hlWallet.findMany({
        where: {
          candidate: true,
          hiddenAt: null,
          savedAt: null,
          qualified: true,
          ...ALIVE,
        },
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

  /**
   * Сохранённые — все, и выпавшие из отбора тоже: причина видна в строке.
   * Кошельки со звёздочкой — первыми: ради них звезда и ставится.
   */
  async saved() {
    const rows = await this.prisma.hlWallet.findMany({
      where: { savedAt: { not: null } },
      orderBy: { savedAt: 'desc' },
    });
    rows.sort((a, b) => Number(!!b.starredAt) - Number(!!a.starredAt));
    return { rows: rows.map(rowOf) };
  }

  /** Звёздочка — только сохранённому: это «доверяю тем, кого взял в работу». */
  async setStar(raw: string, on: boolean) {
    const address = addressOf(raw);
    const w = await this.prisma.hlWallet.findUnique({ where: { address } });
    if (!w?.savedAt)
      throw new NotFoundException({
        message: 'Кошелёк не сохранён',
        code: 'HL_WALLET_NOT_FOUND',
      });
    await this.prisma.hlWallet.update({
      where: { address },
      data: { starredAt: on ? (w.starredAt ?? new Date()) : null },
    });
    return { ok: true };
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
   * Добавить свой кошелёк по адресу — минуя отбор бота. Строки может не быть
   * (кошелёк не в лидерборде или не прошёл) — создаётся; была удалённая — снова
   * видна. Разбор подхватит бот: у него `analyzedAt` пуст, а такие идут первыми.
   */
  async add(raw: string, note: string | undefined) {
    const address = addressOf(raw);
    const text = note?.trim() || null;
    const now = new Date();
    const row = await this.prisma.hlWallet.upsert({
      where: { address },
      create: { address, savedAt: now, note: text },
      update: { savedAt: now, hiddenAt: null, ...(text ? { note: text } : {}) },
    });
    this.cache = null;
    return rowOf(row);
  }

  /** Открытые ордера сохранённого кошелька (новые первыми, не больше 300). */
  orders(
    raw: string,
    now: number = Date.now(),
  ): Promise<{ asOf: string; orders: HlOrder[] }> {
    return this.cached(raw, 'orders', now, async (address) => {
      const res = await hlInfo<RawOpenOrder[]>(
        { type: 'frontendOpenOrders', user: address },
        WEIGHT.default,
      );
      return { asOf: new Date(now).toISOString(), orders: ordersOf(res) };
    });
  }

  /**
   * Сделки сохранённого кошелька — позиции, собранные из его исполнений (новые
   * первыми), и разбивка по монетам. Окно истории у Hyperliquid — последние 2000
   * исполнений, отсюда `since`.
   */
  trades(
    raw: string,
    now: number = Date.now(),
  ): Promise<{ asOf: string } & ReturnType<typeof tradesOf>> {
    return this.cached(raw, 'trades', now, async (address) => {
      const res = await hlInfo<RawFill[]>(
        { type: 'userFills', user: address, aggregateByTime: true },
        WEIGHT.userFills,
      );
      return { asOf: new Date(now).toISOString(), ...tradesOf(res) };
    });
  }

  /**
   * Только сохранённые: иначе эндпоинт — прокси к Hyperliquid по любому адресу
   * на бюджет `api`. Ответ и запрос в пути — общие на (вид, кошелёк).
   */
  private async cached<T>(
    raw: string,
    kind: 'orders' | 'trades',
    now: number,
    load: (address: string) => Promise<T>,
  ): Promise<T> {
    const address = addressOf(raw);
    const w = await this.prisma.hlWallet.findUnique({
      where: { address },
      select: { savedAt: true },
    });
    if (!w?.savedAt)
      throw new NotFoundException({
        message: 'Кошелёк не сохранён',
        code: 'HL_WALLET_NOT_FOUND',
      });
    const key = `${kind}:${address}`;
    const hit = this.activity.get(key);
    if (hit && now - hit.at < ACTIVITY_TTL_MS) return hit.value as Promise<T>;
    const value = load(address);
    this.activity.set(key, { at: now, value });
    // Сбой в кэше не держим: следующий клик пробует заново.
    value.catch(() => this.activity.delete(key));
    return value;
  }

  /**
   * Убрать из сохранённых. Заметка остаётся: «Сохранён ✓» снимается одним
   * кликом, и случайный клик не должен стирать написанное. Не-кандидата
   * следующий отбор удалит сам — вместе с заметкой.
   */
  async unsave(raw: string) {
    await this.prisma.hlWallet.updateMany({
      where: { address: addressOf(raw) },
      data: { savedAt: null, starredAt: null },
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
  async positions(now: number = Date.now()): Promise<PositionsSnapshot> {
    let snap: PositionsSnapshot;
    if (this.cache && now - this.cache.at < POSITIONS_TTL_MS) {
      snap = this.cache.value;
    } else {
      this.inflight ??= this.loadPositions(now).finally(() => {
        this.inflight = null;
      });
      snap = await this.inflight;
    }
    this.resolveOpened(snap, now);
    return {
      ...snap,
      positions: snap.positions.map((p) => {
        const o = this.opened.get(p.address)?.get(p.coin);
        return o && o.side === p.side
          ? { ...p, openedAt: o.at, openedPartial: o.partial }
          : { ...p, openedAt: null, openedPartial: false };
      }),
    };
  }

  /**
   * Время открытия берётся из исполнений и ищется в фоне: запрос тяжёлый (вес
   * до 120), а позиции читают каждые 30 с. Ответ с позициями его не ждёт —
   * время появится на следующем опросе. Закрытая позиция из памяти уходит:
   * открытая заново — уже другая.
   */
  private resolveOpened(snap: PositionsSnapshot, now: number) {
    const held = new Map<string, Set<string>>();
    for (const p of snap.positions) {
      if (!held.has(p.address)) held.set(p.address, new Set());
      held.get(p.address)!.add(p.coin);
    }
    for (const [address, coins] of this.opened) {
      for (const coin of coins.keys())
        if (!held.get(address)?.has(coin)) coins.delete(coin);
    }
    const missing = snap.positions.some((p) => {
      const o = this.opened.get(p.address)?.get(p.coin);
      return !o || o.side !== p.side;
    });
    if (!missing || this.resolving) return;
    this.resolving = (async () => {
      for (const [address] of held) {
        const known = this.opened.get(address);
        const need = snap.positions.some(
          (p) =>
            p.address === address &&
            (!known?.get(p.coin) || known.get(p.coin)!.side !== p.side),
        );
        const tried = this.openedTried.get(address) ?? 0;
        if (!need || now - tried < OPENED_RETRY_MS) continue;
        this.openedTried.set(address, now);
        try {
          const raw = await hlInfo<RawFill[]>(
            { type: 'userFills', user: address, aggregateByTime: true },
            WEIGHT.userFills,
          );
          const open = tradesOf(raw).trades.filter((t) => t.closedAt == null);
          const next = new Map<
            string,
            { at: number | null; partial: boolean; side: 'long' | 'short' }
          >();
          for (const t of open)
            next.set(t.coin, {
              at: t.openedAt,
              partial: t.partial,
              side: t.side,
            });
          // Позиция старше окна исполнений: в нём её входа нет, и искать его заново нечем.
          for (const p of snap.positions)
            if (p.address === address && !next.has(p.coin))
              next.set(p.coin, { at: null, partial: true, side: p.side });
          this.opened.set(address, next);
        } catch {
          // Отказ шлюза или сбой кошелька: время просто не покажется, повтор — через две минуты.
        }
      }
    })().finally(() => {
      this.resolving = null;
    });
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
