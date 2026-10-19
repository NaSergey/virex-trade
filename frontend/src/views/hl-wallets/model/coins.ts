import type { HlPosition } from '../api/hooks';

export interface CoinGroup {
  coin: string;
  /** Сколько сохранённых кошельков держат монету. */
  wallets: number;
  longs: number;
  shorts: number;
  /** Все в одну сторону — она; иначе разнонаправленно. */
  direction: 'long' | 'short' | 'mixed';
  longNotional: number;
  shortNotional: number;
  /** Лонг минус шорт в долларах: плюс — кошельки в сумме в лонге. */
  netNotional: number;
  unrealizedPnl: number;
  positions: HlPosition[];
}

/**
 * Позиции сохранённых кошельков, сведённые по монетам. В список попадает монета,
 * которую держат не меньше `minWallets` кошельков: сделка одного кошелька — не
 * «общее направление», а его личное дело (и она видна в раскрытии самого кошелька).
 * Сначала монеты, на которых сошлись больше кошельков, затем — с бо́льшим объёмом.
 */
export function groupByCoin(positions: HlPosition[], minWallets = 2): CoinGroup[] {
  const byCoin = new Map<string, HlPosition[]>();
  for (const p of positions) byCoin.set(p.coin, [...(byCoin.get(p.coin) ?? []), p]);

  const groups: CoinGroup[] = [];
  for (const [coin, list] of byCoin) {
    const wallets = new Set(list.map((p) => p.address)).size;
    if (wallets < minWallets) continue;
    const longs = list.filter((p) => p.side === 'long');
    const shorts = list.filter((p) => p.side === 'short');
    const sum = (xs: HlPosition[], f: (p: HlPosition) => number) => xs.reduce((s, p) => s + f(p), 0);
    const longNotional = sum(longs, (p) => p.notional);
    const shortNotional = sum(shorts, (p) => p.notional);
    groups.push({
      coin,
      wallets,
      longs: longs.length,
      shorts: shorts.length,
      direction: shorts.length === 0 ? 'long' : longs.length === 0 ? 'short' : 'mixed',
      longNotional,
      shortNotional,
      netNotional: longNotional - shortNotional,
      unrealizedPnl: sum(list, (p) => p.unrealizedPnl),
      positions: list,
    });
  }
  return groups.sort(
    (a, b) => b.wallets - a.wallets || b.longNotional + b.shortNotional - (a.longNotional + a.shortNotional),
  );
}
