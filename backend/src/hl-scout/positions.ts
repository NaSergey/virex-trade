import type { ClearinghouseState } from './hl-types';

export interface HlPosition {
  address: string;
  coin: string;
  side: 'long' | 'short';
  size: number;
  notional: number;
  entryPx: number | null;
  /** Своей цены маркировки в ответе нет — стоимость позиции на её размер. */
  markPx: number | null;
  unrealizedPnl: number;
  leverage: number;
  liquidationPx: number | null;
}

const num = (v: string | null | undefined) =>
  v == null || v === '' ? null : Number(v);

export function positionsOf(
  address: string,
  state: ClearinghouseState,
): HlPosition[] {
  const out: HlPosition[] = [];
  for (const { position: p } of state.assetPositions ?? []) {
    const szi = Number(p.szi);
    if (!szi) continue;
    const notional = Number(p.positionValue);
    out.push({
      address,
      coin: p.coin,
      side: szi > 0 ? 'long' : 'short',
      size: Math.abs(szi),
      notional,
      entryPx: num(p.entryPx),
      markPx: notional ? notional / Math.abs(szi) : null,
      unrealizedPnl: Number(p.unrealizedPnl),
      leverage: p.leverage?.value ?? 0,
      liquidationPx: num(p.liquidationPx),
    });
  }
  return out;
}
