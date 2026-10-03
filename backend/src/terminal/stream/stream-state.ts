import { createHash } from 'crypto';
import { toOrder, toPosition, type TerminalOrder, type TerminalPosition } from '../terminal-math';

/**
 * Состояние счёта терминала, собранное из приватного WebSocket Bybit
 * (спека `2026-10-02-terminal-bybit-websocket-design.md`).
 *
 * Хранятся сырые строки биржи, приведённые к виду REST, а не вид экрана:
 * перевод в позиции и ордера терминала — тот же `toPosition`/`toOrder`, что у
 * REST-пути, и правило остаётся одним.
 */

/** Кошелёк USDT в виде, общем у ответа `wallet-balance` и события `wallet`. */
export interface StreamWallet {
  walletBalance: number;
  equity: number | null;
  unrealisedPnl: number;
  available: number | null;
}

export interface StreamState {
  wallet: StreamWallet | null;
  /** По ключу `символ:positionIdx`: в хедже у монеты две строки. */
  positions: Record<string, any>;
  /** Активные ордера по `orderId`. */
  orders: Record<string, any>;
}

/** Снимок счёта через REST: аккаунт `wallet-balance`, строки позиций и открытых ордеров. */
export interface AccountSnapshot {
  account: any;
  positions: any[];
  orders: any[];
}

/** Строка `terminal_streams`, как её читает `api`. */
export interface StoredStream {
  keyHash: string | null;
  state: unknown;
  liveAt: Date | null;
  eventAt: Date | null;
}

/** Пульс старше этого — соединения, скорее всего, уже нет (`worker` бьёт раз в 10 с). */
export const LIVE_FRESH_MS = 30_000;
/** Столько после своей записи ждём, что поток её увидит, прежде чем снова ему верить. */
export const OWN_WRITE_MS = 3_000;

const ACTIVE = new Set(['New', 'PartiallyFilled']);

const num = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
};

/** В счёт идут USDT-перпы — тот же круг, что `settleCoin: USDT` у REST. */
const usdt = (row: any): boolean => typeof row?.symbol === 'string' && row.symbol.endsWith('USDT');

/** Событие не старше строки, которую заменяет: буфер до снимка не должен откатить снимок. */
const notOlder = (event: any, stored: any): boolean => {
  const e = Number(event?.updatedTime);
  const s = Number(stored?.updatedTime);
  return !(Number.isFinite(e) && Number.isFinite(s) && e < s);
};

/** Отпечаток ключа: по нему `api` узнаёт, что состояние собрано тем же ключом. */
export const keyHash = (apiKey: string): string => createHash('sha256').update(apiKey).digest('hex').slice(0, 16);

/** Аккаунт из `wallet-balance` или события `wallet` → кошелёк USDT; null — аккаунта нет. */
export function walletOf(account: any): StreamWallet | null {
  if (!account) return null;
  const coin = account.coin?.find((c: { coin?: string }) => c?.coin === 'USDT');
  return {
    walletBalance: num(coin?.walletBalance) ?? 0,
    equity: num(coin?.equity),
    unrealisedPnl: num(coin?.unrealisedPnl) ?? 0,
    available: num(account.totalAvailableBalance),
  };
}

/**
 * Депозит — текущий: USDT кошелька вместе с нереализованным результатом
 * (`equity` у Bybit), а без неё — кошелёк плюс открытый результат.
 */
export function balanceOf(w: StreamWallet | null): { balance: number; available: number | null } {
  if (!w) return { balance: 0, available: null };
  return { balance: w.equity ?? w.walletBalance + w.unrealisedPnl, available: w.available };
}

function applyPositions(state: StreamState, rows: unknown[]): void {
  for (const raw of rows as any[]) {
    if (!usdt(raw)) continue;
    // В событии цена входа — `entryPrice`, в REST — `avgPrice`.
    const row = raw.avgPrice == null && raw.entryPrice != null ? { ...raw, avgPrice: raw.entryPrice } : raw;
    const key = `${row.symbol}:${row.positionIdx ?? 0}`;
    if (!notOlder(row, state.positions[key])) continue;
    if ((num(row.size) ?? 0) > 0) state.positions[key] = row;
    else delete state.positions[key];
  }
}

function applyOrders(state: StreamState, rows: unknown[]): void {
  for (const row of rows as any[]) {
    if (!usdt(row) || !row.orderId) continue;
    const key = String(row.orderId);
    if (!notOlder(row, state.orders[key])) continue;
    // Исполненный, снятый, отклонённый — уже не висит. Двойной `Filled`
    // (отмена, совпавшая с исполнением) просто удаляет ещё раз.
    if (ACTIVE.has(row.orderStatus)) state.orders[key] = row;
    else delete state.orders[key];
  }
}

export function fromSnapshot(s: AccountSnapshot): StreamState {
  const state: StreamState = { wallet: walletOf(s.account), positions: {}, orders: {} };
  applyPositions(state, s.positions ?? []);
  applyOrders(state, s.orders ?? []);
  return state;
}

/** Сообщение темы → состояние. false — тема не наша или данных нет. */
export function applyEvent(state: StreamState, msg: { topic?: unknown; data?: unknown }): boolean {
  if (!Array.isArray(msg.data)) return false;
  switch (msg.topic) {
    case 'position.linear':
      applyPositions(state, msg.data);
      return true;
    case 'order.linear':
      applyOrders(state, msg.data);
      return true;
    case 'wallet': {
      const account: any = msg.data.find((a: any) => a?.accountType === 'UNIFIED') ?? msg.data[0];
      // Событие без строки USDT о USDT ничего не говорит: обнулить по нему
      // кошелёк значило бы показать депозит ноль. У REST-снимка — иначе:
      // там отсутствие монеты и есть ответ.
      if (!account?.coin?.some((c: { coin?: string }) => c?.coin === 'USDT')) return false;
      state.wallet = walletOf(account);
      return true;
    }
    default:
      return false;
  }
}

/**
 * Состояние → счёт экрана. Изменение цены событий не даёт, поэтому PnL позиции
 * считается здесь — от маркировки этой секунды; монета без маркировки берёт
 * PnL из последнего события.
 *
 * Депозит — тот же, что у REST и у расчёта объёма: `equity` биржи. Сдвигается
 * он только на то, насколько PnL позиций изменился с момента кошелька: своя
 * сумма «кошелёк + PnL» разошлась бы с `equity` на комиссиях и фандинге, и
 * число на экране прыгало бы при переходе между потоком и REST.
 */
export function project(
  state: StreamState,
  marks: ReadonlyMap<string, number>,
): { balance: number; available: number | null; positions: TerminalPosition[]; orders: TerminalOrder[] } {
  let open = 0;
  const positions: TerminalPosition[] = [];
  for (const row of Object.values(state.positions)) {
    const p = toPosition(row);
    if (!p) continue;
    const mark = marks.get(p.symbol);
    const live =
      mark != null && p.entryPrice > 0
        ? { ...p, markPrice: mark, unrealisedPnl: (mark - p.entryPrice) * p.size * (p.direction === 'long' ? 1 : -1) }
        : p;
    open += live.unrealisedPnl ?? 0;
    positions.push(live);
  }
  const orders = Object.values(state.orders)
    .map(toOrder)
    .filter((o): o is TerminalOrder => o != null);
  const w = state.wallet;
  if (!w) return { balance: 0, available: null, positions, orders };
  return { balance: balanceOf(w).balance - w.unrealisedPnl + open, available: w.available, positions, orders };
}

/**
 * Годится ли строка потока вместо REST: тот же ключ, живой пульс и нет своей
 * записи, которую поток ещё не увидел, — после ордера экран обязан показать
 * счёт после ордера, даже если событие биржи ещё в пути.
 *
 * `eventAt` — часы `worker`, `lastWriteAt` и `now` — часы `api`: сравнивать их
 * можно, пока оба процесса на одной машине (контейнеры одного хоста делят часы
 * ядра). Разнесёте по машинам — сравнение придётся пересмотреть.
 */
export function usable(row: StoredStream | null, hash: string, lastWriteAt: number | null, now: number): boolean {
  if (!row?.state || !row.liveAt || row.keyHash !== hash) return false;
  if (now - row.liveAt.getTime() > LIVE_FRESH_MS) return false;
  const unseenWrite =
    lastWriteAt != null && now - lastWriteAt < OWN_WRITE_MS && (!row.eventAt || row.eventAt.getTime() < lastWriteAt);
  return !unseenWrite;
}
