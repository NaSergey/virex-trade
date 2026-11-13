import type { HlPosition } from './positions';

/** Профиль трейдера — HyperDash, как и в таблице владельца (`profileUrl` на фронте). */
const PROFILE_URL = 'https://hyperdash.info/trader/';

/**
 * Проверка стояла дольше этого (перезапуск `worker`, пауза после 429, не было
 * чата) — сообщение так и говорит: позиция могла открыться и раньше, чем
 * найдена. Обычный зазор — одна минута.
 */
export const STALE_GAP_MIN = 5;

export interface SeenPosition {
  coin: string;
  side: 'long' | 'short';
}

/** Что колокольчик помнит о кошельке: время проверки и позиции, которые тогда стояли. */
export interface Seen {
  at: number;
  positions: SeenPosition[];
}

export function seenOf(at: number, current: HlPosition[]): Seen {
  return {
    at,
    positions: current.map((p) => ({ coin: p.coin, side: p.side })),
  };
}

/**
 * Состояние из JSON-столбца. Не той формы — `null`, то есть «базовой проверки не
 * было»: следующий проход тихо запомнит позиции, а не бросит ошибку и не объявит
 * всё, что есть у кошелька, взятым.
 */
export function parseSeen(raw: unknown): Seen | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { at, positions } = raw as { at?: unknown; positions?: unknown };
  if (typeof at !== 'number' || !Array.isArray(positions)) return null;
  const ok = positions.filter(
    (p): p is SeenPosition =>
      typeof p === 'object' &&
      p !== null &&
      typeof (p as SeenPosition).coin === 'string' &&
      ((p as SeenPosition).side === 'long' ||
        (p as SeenPosition).side === 'short'),
  );
  return { at, positions: ok };
}

/**
 * Взятые позиции: пара «монета + сторона», которой не было в прошлую проверку.
 * `null` — базовой проверки ещё не было (колокольчик только включили): всё, что
 * кошелёк держит, он держит давно, и объявлять это взятием нельзя. Переворот
 * лонга в шорт — новая сторона, то есть взятие; добор и закрытие — нет.
 */
export function newPositions(
  prev: SeenPosition[] | null,
  current: HlPosition[],
): HlPosition[] {
  if (prev === null) return [];
  const had = new Set(prev.map((p) => `${p.coin}:${p.side}`));
  return current.filter((p) => !had.has(`${p.coin}:${p.side}`));
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const groups = (int: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Деньги — целыми долларами: на позициях в сотни тысяч центы шум. */
const usd = (n: number) => `$${groups(String(Math.round(n)))}`;

/**
 * Цена входа: у дорогих монет — до двух знаков, у дешёвых — пять значащих,
 * иначе 0.0000123 превратился бы в «0».
 */
function price(px: number): string {
  if (px >= 1000) {
    const [int, frac] = px.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').split('.');
    return frac ? `${groups(int)}.${frac}` : groups(int);
  }
  const s = px.toPrecision(5);
  const plain = s.includes('e') ? px.toFixed(10) : s;
  return plain.includes('.') ? plain.replace(/0+$/, '').replace(/\.$/, '') : plain;
}

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Текст для Telegram (parse_mode HTML): одно сообщение на кошелёк, строка на каждую позицию. */
export function alertText(args: {
  address: string;
  note: string | null;
  positions: HlPosition[];
  /** Минут с прошлой проверки. */
  gapMin: number;
}): string {
  const who = esc(args.note?.trim() || shortAddress(args.address));
  const lines = args.positions.map((p) => {
    const parts = [
      p.coin,
      p.side === 'long' ? 'лонг' : 'шорт',
      usd(p.notional),
    ];
    if (p.entryPx != null) parts.push(`вход ${price(p.entryPx)}`);
    if (p.leverage) parts.push(`плечо ${p.leverage}x`);
    return esc(parts.join(' · '));
  });
  const out = [
    `🔔 <b>${who}</b> взял ${args.positions.length > 1 ? 'позиции' : 'позицию'}`,
    ...lines,
    `<a href="${PROFILE_URL}${args.address}">Профиль ↗</a>`,
  ];
  if (args.gapMin > STALE_GAP_MIN)
    out.push(
      `<i>Проверка стояла ${args.gapMin} мин — позиция могла открыться раньше.</i>`,
    );
  return out.join('\n');
}
