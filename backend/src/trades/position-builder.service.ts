import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExchangeRegistry } from '../exchanges/exchange-registry.service';
import { ExchangeCredentials, ExchangeId, PositionsResult } from '../exchanges/exchange.types';
import { fillDelta, type FillLike, type PositionSide } from './positions';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BACKFILL_WEEKS = 30; // first run: cover the same span as the trade backfill
// Sizes come back as decimal strings; comparing the running total to an exact 0
// would leave a dust remainder open forever on float arithmetic.
const SIZE_EPS = 1e-8;
const SIDES: PositionSide[] = ['long', 'short'];

/** Открытый размер по сторонам одного символа (в хэдж-режиме обе ненулевые). */
type SideSizes = Record<PositionSide, number>;

/**
 * Начало «хвоста» — позиции символа+стороны, которая ещё не закрылась в
 * ноль к концу последнего прохода `rebuild`. `null` — сторона на тот момент
 * была плоской. Отсутствие ключа (см. `Partial`) — не «плоско», а «неизвестно»:
 * так размечает сам `rebuild`, когда сторону не удалось разрешить
 * (`buildSide` вернул null) или когда символ вообще не входил в область
 * обхода этого прохода. T13 читает такую метку как «не доверяй, перечитай
 * заново» — то же самое, что делает holодный кэш.
 */
type SymbolTail = Partial<Record<PositionSide, number | null>>;

/**
 * T13: кэш инкрементальной перестройки на пользователя+биржу, живёт в памяти
 * процесса. Не переживает рестарт и не расшарен между api/worker — это
 * безопасно: холодный (или просто отсутствующий) кэш всегда идёт по полному
 * пути (см. `sync`), то есть худший случай от потери кэша — один лишний
 * полный обход, а не сдвинутая граница позиции.
 */
interface RebuildCacheEntry {
  /** Открытый размер по символу+стороне на момент последнего прохода. */
  sizes: Map<string, SideSizes>;
  /** Хвосты по символу, см. `SymbolTail`. */
  openedAt: Map<string, SymbolTail>;
}

/**
 * Reconstructs real positions out of the exchange's per-order closed-pnl rows.
 *
 * Exchanges emit one closed-pnl record per CLOSING ORDER, so taking profit in
 * three parts looks like three trades, and averaging into a position splits it
 * further. That inflates the trade count and skews winrate upward (partial
 * take-profits are almost always green, partial stop-outs are not a thing).
 *
 * closed-pnl alone cannot fix this: it never reports the running position size,
 * so a partial exit is indistinguishable from a separate trade. Execution
 * history can — walking fills in order, a position runs from the moment size
 * leaves 0 until it returns to 0. Averaging in and scaling out both fall out of
 * that definition for free, with no time-window or price heuristics.
 *
 * Fills are stored locally (see the Execution model) so this runs off the
 * database on every tick; the exchange is only queried for the new window.
 *
 * T13 (A4): `rebuild` used to re-read this user's ENTIRE execution and trade
 * history every tick, even in steady state where nothing changed — 2.9M rows/
 * minute at 1000 connected accounts. `sync` now skips `rebuild` outright when
 * nothing could have moved a position boundary, and otherwise scopes it to the
 * symbols a new fill or a live size change actually touched, bounded by how
 * far back each symbol's own open tail could possibly extend. See `sync` and
 * `scopeFor` below for the correctness argument — position boundaries are a
 * correctness question, not just a performance one, so the scoping is designed
 * to be provably never *narrower* than the full rebuild would need, only
 * sometimes wider (which just costs an extra read, never a wrong id).
 */
@Injectable()
export class PositionBuilderService {
  private readonly logger = new Logger(PositionBuilderService.name);
  private readonly rebuildCache = new Map<string, RebuildCacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly exchanges: ExchangeRegistry,
  ) {}

  /**
   * Pull new fills, then re-derive position boundaries and stamp `positionId`
   * on the affected trades. Returns what changed so callers can log it.
   *
   * Scoped to one exchange throughout: replaying fills from two exchanges as a
   * single running size would split positions at meaningless points.
   *
   * T12 (A3): `openPositions` is a parameter, not fetched here — the caller
   * (`TradeSyncService`) already needs the same exchange call for its own tag
   * pruning and fetches it once per tick; this used to be a second, identical
   * `getOpenPositions` call.
   */
  async sync(
    userId: string,
    exchange: ExchangeId,
    creds: ExchangeCredentials,
    openPositions: PositionsResult,
    opts?: { full?: boolean; newTradeSymbols?: Set<string> },
  ): Promise<{ fills: number; positions: number; stamped: number }> {
    const { count: fills, touched } = await this.fetchAndStoreExecutions(
      userId,
      exchange,
      creds,
      opts,
    );
    const openSizes = this.currentSizes(openPositions);
    const cacheKey = `${userId}:${exchange}`;
    // opts?.full — явный полный ресинк: не доверяем кэшу, обходим всё, как
    // раньше, и пересобираем его с нуля.
    const cached = opts?.full ? undefined : this.rebuildCache.get(cacheKey);

    if (cached) {
      const changed = this.changedSymbols(cached.sizes, openSizes);
      // T13: без новых филлов и без сдвига открытого размера ни у одного
      // символа граница позиции не могла поменяться — perечитывать executions
      // незачем (см. A4). Сомневаться тут не в чем: `changed` сравнивает
      // именно то же самое `openSizes`, что пошло бы на seed rebuild ниже.
      //
      // T-final-review (IMPORTANT): это условие не учитывало, что closed-pnl
      // запись сделки (`Trade`, символ есть в `opts.newTradeSymbols`) может
      // прийти ПОЗЖЕ, чем её execution-филл (уже учтён в прошлом тике →
      // `fills === 0` сейчас), а размер позиции по символу уже давно не
      // менялся (`changed.size === 0`, закрытие по факту случилось раньше).
      // Тогда `positionId` только что вставленного `Trade` остаётся `null`
      // навсегда, если по символу больше нет активности — непустой
      // `newTradeSymbols` форсирует rebuild именно в этом случае.
      if (fills === 0 && changed.size === 0 && !opts?.newTradeSymbols?.size) {
        return { fills: 0, positions: 0, stamped: 0 };
      }
      // T-final-review (re-review, IMPORTANT): `newTradeSymbols` идёт в сам
      // `scopeFor` третьим источником символов — не отдельным «пустой scope
      // → полный обход» фолбэком (как было в предыдущем заходе). Тот фолбэк
      // ловил только случай, когда `newTradeSymbols` был ЕДИНСТВЕННЫМ
      // сигналом за весь тик; в смешанном тике (другой символ даёт
      // touched/changed-активность) scope был непустым, и символ из
      // `newTradeSymbols` в него не попадал. Объединение символов внутри
      // `scopeFor` закрывает оба случая одним и тем же путём и делает старый
      // фолбэк структурно недостижимым (если `newTradeSymbols` непуст,
      // `scope.symbols` не может быть пуст) — поэтому он убран, а не оставлен
      // мёртвым кодом.
      const scope = this.scopeFor(cached, touched, changed, opts?.newTradeSymbols);
      const { positions, stamped, openTail } = await this.rebuild(
        userId,
        exchange,
        openSizes,
        scope,
      );
      this.rebuildCache.set(cacheKey, {
        sizes: openSizes,
        openedAt: this.mergeTail(cached.openedAt, openTail),
      });
      return { fills, positions, stamped };
    }

    // Холодный кэш (первый прогон для этой пары пользователь+биржа в этом
    // процессе, или явный full) — обходим всю историю, как до T13, и
    // заполняем кэш заново.
    const { positions, stamped, openTail } = await this.rebuild(
      userId,
      exchange,
      openSizes,
      null,
    );
    this.rebuildCache.set(cacheKey, { sizes: openSizes, openedAt: openTail });
    return { fills, positions, stamped };
  }

  /**
   * Размер открытых прямо сейчас позиций, по символу и стороне, из уже
   * полученного ответа биржи. Нужен, чтобы засеять обход ниже: сохранённая
   * история начинается с середины, и позиция, открытая до первого
   * сохранённого филла, иначе никогда не сойдётся.
   *
   * Стороны считаются раздельно — в хэдж-режиме биржа отдаёт по символу две
   * записи сразу, и складывать их в одно число значит потерять обе.
   */
  private currentSizes(open: PositionsResult): Map<string, SideSizes> {
    const sizes = new Map<string, SideSizes>();
    if (!open.success) return sizes;
    for (const p of open.positions) {
      const size = parseFloat(p.size);
      if (!(size > 0)) continue;
      const cur = sizes.get(p.symbol) ?? { long: 0, short: 0 };
      cur[p.direction] += size;
      sizes.set(p.symbol, cur);
    }
    return sizes;
  }

  /**
   * Символы, у которых открытый размер (по любой стороне) сдвинулся сильнее
   * эпсилон дребезга округления с прошлого прохода. Используется и для
   * решения «перестраивать вообще или нет» (T13 п.1), и для расширения
   * области перестройки помимо символов с новыми филлами (T13 п.2) — размер
   * мог измениться раньше, чем `fetchAndStoreExecutions` успел увидеть сам
   * филл.
   */
  private changedSymbols(
    prev: Map<string, SideSizes>,
    next: Map<string, SideSizes>,
  ): Set<string> {
    const changed = new Set<string>();
    const symbols = new Set<string>([...prev.keys(), ...next.keys()]);
    for (const s of symbols) {
      const a = prev.get(s) ?? { long: 0, short: 0 };
      const b = next.get(s) ?? { long: 0, short: 0 };
      if (Math.abs(a.long - b.long) > SIZE_EPS || Math.abs(a.short - b.short) > SIZE_EPS) {
        changed.add(s);
      }
    }
    return changed;
  }

  /**
   * T13: область скопированной перестройки — какие символы трогать и с
   * какого момента времени читать их филлы.
   *
   * Символы — объединение тех, где появились новые филлы (`touched`), тех,
   * где сам открытый размер сдвинулся (`changed`; отдельно от `touched` на
   * случай, когда биржа уже показывает новый размер, а `fetchFills` его ещё
   * не догнал), и тех, что получили новый closed-pnl `Trade` в этом тике
   * (`newTradeSymbols` — T-final-review, re-review): closed-pnl запись может
   * прийти позже своего execution-филла, когда сам филл уже разобран в
   * прошлом тике и не даёт сигнала ни через `touched`, ни через `changed`.
   * Без этого источника символ с опоздавшим `Trade`, но без собственной
   * свежей активности, не попадал бы в scope вовсе — даже если scope в целом
   * непуст из-за ДРУГОГО символа того же тика (смешанный тик).
   *
   * Порог по времени — свой на каждый символ, через `floorFor`: не единая
   * дата на всех, потому что общая дата либо была бы не строже {@link
   * floorFor} (бесполезна), либо рисковала бы обрезать более старую историю
   * символа, которого просто не было в самой свежей ещё открытой позиции
   * другого символа (см. комментарий класса — там разбор, почему это было бы
   * некорректно). Символам из `newTradeSymbols` без собственного сигнала
   * `touched` `floorFor` естественно даёт `null` (вся история символа) или
   * границу его собственного открытого хвоста — оба варианта безопасны, `null`
   * просто шире необходимого.
   */
  private scopeFor(
    cached: RebuildCacheEntry,
    touched: Map<string, number>,
    changed: Set<string>,
    newTradeSymbols?: Set<string>,
  ): { symbols: string[]; floorMsBySymbol: Map<string, number | null> } {
    const symbols = new Set<string>([...touched.keys(), ...changed, ...(newTradeSymbols ?? [])]);
    const floorMsBySymbol = new Map<string, number | null>();
    for (const s of symbols) {
      floorMsBySymbol.set(s, this.floorFor(cached, s, touched.get(s)));
    }
    return { symbols: [...symbols], floorMsBySymbol };
  }

  /**
   * Самый ранний момент, откуда обязательно перечитывать филлы ОДНОГО
   * символа, чтобы перестройка дала тот же результат, что и полный обход.
   * `null` значит «без ограничения» — читать всю историю символа, это всегда
   * безопасный (пусть и не самый дешёвый) ответ.
   *
   * - Кэш знает про открытый хвост на этом символе (с прошлого прохода, то
   *   есть ДО филлов этого тика) — граница не может быть раньше его начала:
   *   позиция, которая уже была открыта, не может задним числом «переехать»
   *   на более раннее время. Обе стороны разом (min из двух) — хэдж-режим
   *   живёт по одному символу на двух сторонах одновременно.
   * - Кэш знает, что символ был плоским (хвоста нет, но символ встречался
   *   раньше) — тогда всё, что случилось ДО самого раннего нового филла этого
   *   тика, уже разложено по закрытым позициям и трогать нечего.
   * - Символ кэшу не знаком вообще (первый раз в обход, или прошлый проход
   *   не смог его разрешить, см. `rebuild`) — не с чем сравнивать, полная
   *   история символа.
   */
  private floorFor(
    cached: RebuildCacheEntry,
    symbol: string,
    newFillFloorMs: number | undefined,
  ): number | null {
    const tail = cached.openedAt.get(symbol);
    if (!tail) return null;
    const starts = SIDES.map((d) => tail[d]).filter(
      (v): v is number => v != null,
    );
    if (starts.length > 0) return Math.min(...starts);
    if (newFillFloorMs != null) return newFillFloorMs;
    return null;
  }

  /** Полный кэш хвостов плюс перезаписанные записи для только что обойдённых символов. */
  private mergeTail(
    old: Map<string, SymbolTail>,
    fresh: Map<string, SymbolTail>,
  ): Map<string, SymbolTail> {
    const merged = new Map(old);
    for (const [symbol, tail] of fresh) merged.set(symbol, tail);
    return merged;
  }

  /**
   * Fetch execution history in 7-day windows and upsert it locally. On the
   * first run (or `full`) it walks the whole backfill span; afterwards only the
   * window since the newest stored fill, so steady state is a single request.
   *
   * `touched` — самое раннее время нового филла по каждому символу из этого
   * окна (даже если сам филл дублировал уже сохранённый); T13 использует его
   * как границу для символов, которые кэш ещё не видел открытыми.
   */
  private async fetchAndStoreExecutions(
    userId: string,
    exchange: ExchangeId,
    creds: ExchangeCredentials,
    opts?: { full?: boolean },
  ): Promise<{ count: number; touched: Map<string, number> }> {
    const newest = await this.prisma.execution.findFirst({
      where: { userId, exchange },
      orderBy: { execTime: 'desc' },
      select: { execTime: true },
    });
    const now = Date.now();
    // Re-scan a full week back from the newest fill: an exchange can report a
    // fill slightly late, and re-fetching is free (execId dedupes on insert).
    const from =
      opts?.full || !newest
        ? now - BACKFILL_WEEKS * WEEK_MS
        : newest.execTime.getTime() - WEEK_MS;

    const fetched = await this.exchanges
      .get(exchange)
      .fetchFills(creds, { startMs: from, endMs: now });
    if (fetched.partial) {
      this.logger.warn(`execution fetch incomplete for ${exchange}: ${fetched.error}`);
    }
    // Funding rode in on the same pages. It is stored apart from Execution so
    // it can never be replayed as position size, and stored at all so the cost
    // of holding a position stops being invisible.
    if (fetched.funding?.length) {
      const fees: Prisma.FundingFeeCreateManyInput[] = fetched.funding.map((f) => ({
        userId,
        exchange,
        symbol: f.symbol,
        amount: f.amount,
        at: f.at,
        execId: f.execId,
      }));
      await this.prisma.fundingFee.createMany({ data: fees, skipDuplicates: true });
    }

    if (fetched.items.length === 0) return { count: 0, touched: new Map() };

    const touched = new Map<string, number>();
    for (const f of fetched.items) {
      const ms = f.execTime.getTime();
      const cur = touched.get(f.symbol);
      if (cur == null || ms < cur) touched.set(f.symbol, ms);
    }

    const rows: Prisma.ExecutionCreateManyInput[] = fetched.items.map((f) => ({
      userId,
      exchange,
      symbol: f.symbol,
      side: f.side,
      qty: f.qty,
      price: f.price,
      closedSize: f.closedSize,
      execType: f.execType,
      orderId: f.orderId,
      execId: f.execId,
      execTime: f.execTime,
    }));
    const res = await this.prisma.execution.createMany({ data: rows, skipDuplicates: true });
    return { count: res.count, touched };
  }

  /**
   * Условие WHERE для чтения `executions` под перестройку: без ограничений
   * при полном обходе (`scope === null`), иначе — только перечисленные
   * символы, каждый от своей границы времени (или без неё, если границы нет).
   */
  private executionsWhere(
    userId: string,
    exchange: ExchangeId,
    scope: { symbols: string[]; floorMsBySymbol: Map<string, number | null> } | null,
  ): Prisma.ExecutionWhereInput {
    if (!scope) return { userId, exchange };
    return {
      userId,
      exchange,
      OR: scope.symbols.map((symbol) => {
        const floor = scope.floorMsBySymbol.get(symbol);
        return floor != null ? { symbol, execTime: { gte: new Date(floor) } } : { symbol };
      }),
    };
  }

  /**
   * Walk stored fills per symbol and group the closing orders into positions.
   *
   * Stored history starts mid-stream, so a position opened before the first
   * stored fill shows up as closes without opens. The starting size is
   * recovered from the identity `size_now = size_start + sum(fills)`: whatever
   * doesn't balance must have been open before the history began.
   *
   * Лонг и шорт проходятся раздельно (см. fillDelta): в хэдж-режиме они живут
   * по одному символу одновременно, и общий размер по символу схлопывал бы их
   * в одну позицию. Сторона, которая так и не сошлась в ноль, остаётся
   * непроштампованной — её строки продолжают считаться сделками поштучно, как
   * раньше, но вторую сторону это больше не портит.
   *
   * T13: `scope` сужает и чтение `executions`, и чтение `trades` для штамповки
   * — при `null` (полный обход) поведение побитово то же самое, что было до
   * задачи.
   */
  private async rebuild(
    userId: string,
    exchange: ExchangeId,
    openSizes: Map<string, SideSizes>,
    scope: { symbols: string[]; floorMsBySymbol: Map<string, number | null> } | null,
  ): Promise<{ positions: number; stamped: number; openTail: Map<string, SymbolTail> }> {
    const fills = await this.prisma.execution.findMany({
      where: this.executionsWhere(userId, exchange, scope),
      orderBy: [{ symbol: 'asc' }, { execTime: 'asc' }],
      select: {
        symbol: true,
        side: true,
        qty: true,
        closedSize: true,
        orderId: true,
        execTime: true,
      },
    });

    // orderId -> positionId, for every fill that closed part of a position.
    const orderToPosition = new Map<string, string>();
    let positions = 0;

    const bySymbol = new Map<string, typeof fills>();
    for (const f of fills) {
      const list = bySymbol.get(f.symbol);
      if (list) list.push(f);
      else bySymbol.set(f.symbol, [f]);
    }

    const openTail = new Map<string, SymbolTail>();
    for (const [symbol, list] of bySymbol) {
      const open = openSizes.get(symbol) ?? { long: 0, short: 0 };
      const tail: SymbolTail = {};
      for (const dir of SIDES) {
        // size_start = size_now - sum(fills). Non-zero means the symbol already
        // held a position when the stored history begins; seeding it lets that
        // first position close correctly instead of dragging the whole symbol
        // out of balance.
        const net = list.reduce((s, f) => s + fillDelta(f)[dir], 0);
        const built = this.buildSide(symbol, dir, list, open[dir] - net);
        if (!built) {
          this.logger.warn(
            `position size never settled for ${symbol} ${dir} — leaving its trades ungrouped`,
          );
          // Хвост этой стороны остаётся не выставлен в `tail` — T13 читает
          // отсутствие ключа как «неизвестно», а не «плоско», и в следующий
          // раз перечитает эту сторону целиком.
          continue;
        }
        tail[dir] = built.openTail;
        for (const r of built.resolved) {
          positions++;
          for (const id of r.orderIds) orderToPosition.set(id, r.positionId);
        }
      }
      openTail.set(symbol, tail);
    }

    // Stamp only what actually changed, so a steady-state tick writes nothing.
    // T13: при scoped-перестройке читаем сделки только затронутых символов —
    // трейды остальных символов заведомо не найдутся в orderToPosition (их
    // туда некому было положить) и всё равно не поменялись бы.
    const trades = await this.prisma.trade.findMany({
      where: scope ? { userId, exchange, symbol: { in: scope.symbols } } : { userId, exchange },
      select: { id: true, orderId: true, positionId: true },
    });
    let stamped = 0;
    for (const t of trades) {
      const next = orderToPosition.get(t.orderId);
      if (!next || next === t.positionId) continue;
      await this.prisma.trade.update({
        where: { id: t.id },
        data: { positionId: next },
      });
      stamped++;
    }
    return { positions, stamped, openTail };
  }

  /**
   * Границы позиций ОДНОЙ стороны символа: позиция живёт с момента, когда её
   * размер уходит с нуля, и до возврата в ноль. Филлы чужой стороны дают
   * нулевую дельту и просто пропускаются.
   *
   * Возвращает null, если размер не сошёлся в ноль ни разу при наличии
   * закрытий — значит засев стартового размера промахнулся, и группировать
   * такую сторону наугад хуже, чем оставить её строки поштучно.
   *
   * `openTail` — начало ещё не закрытой позиции на конец обхода (`null`,
   * если сторона в итоге плоская). T13 кэширует именно это значение, даже
   * когда у хвоста нет ни одного частичного закрытия (`pending` пуст) — само
   * время не зависит от того, была ли уже штамповка.
   */
  private buildSide(
    symbol: string,
    dir: PositionSide,
    fills: Array<FillLike & { orderId: string; execTime: Date }>,
    startSize: number,
  ): { resolved: { positionId: string; orderIds: string[] }[]; openTail: number | null } | null {
    let size = Math.abs(startSize) < SIZE_EPS ? 0 : startSize;
    // A position inherited from before the history has no known open time;
    // anchor it to the first fill we do have so its id stays stable.
    let openedAt: number | null = size !== 0 ? fills[0].execTime.getTime() : null;
    let pending: string[] = []; // closing orderIds of the position being built
    const resolved: { positionId: string; orderIds: string[] }[] = [];
    // Сторона в ключе: лонг и его хэдж-шорт по одному символу могут открыться
    // в одну миллисекунду, и без неё получили бы общий id.
    const idAt = (ms: number) => `${symbol}:${dir}:${ms}`;

    for (const f of fills) {
      const delta = fillDelta(f)[dir];
      if (delta === 0) continue;
      if (size === 0) openedAt = f.execTime.getTime();
      size += delta;
      if (Math.abs(size) < SIZE_EPS) size = 0;
      // delta < 0 — этот филл уменьшал именно нашу сторону, то есть закрывал её.
      if (delta < 0 && f.orderId) pending.push(f.orderId);
      if (size === 0 && openedAt != null) {
        // Position fully closed — every closing order seen since it opened
        // belongs to this one position. Keyed by open time so repeated
        // rebuilds produce identical ids (a side can only open once per ms).
        resolved.push({ positionId: idAt(openedAt), orderIds: pending });
        pending = [];
        openedAt = null;
      }
    }

    if (size !== 0 && resolved.length === 0 && pending.length > 0) return null;
    // Still-open position that has already been scaled out of: those partial
    // closes belong to one position even though it isn't finished. The id is
    // keyed on its open time, so it stays the same once it fully closes.
    if (size !== 0 && openedAt != null && pending.length > 0) {
      resolved.push({ positionId: idAt(openedAt), orderIds: pending });
    }
    return { resolved, openTail: size !== 0 ? openedAt : null };
  }
}
