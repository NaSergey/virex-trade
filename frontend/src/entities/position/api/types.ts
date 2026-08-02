// Открытая позиция из Bybit v5 /position/list, как её отдаёт биржа — все
// числа строками. `createdTime` НЕ сбрасывается на каждую новую позицию по
// символу, поэтому «сколько времени в позиции» считается не отсюда, а по
// нашим часам (OpenPositionSeen, см. usePositionTags → openedAt).
export interface BybitPosition {
  symbol: string;
  side: 'Buy' | 'Sell' | '';
  size: string;
  avgPrice: string;
  markPrice: string;
  positionValue: string;
  unrealisedPnl: string;
  leverage: string;
  liqPrice: string;
  takeProfit: string;
  stopLoss: string;
  createdTime: string;
  updatedTime: string;
}

// ── Entry context of an open position (snapshot taken when it opened) ──
export interface OpenPositionContext {
  // null = снимок ещё не сделан (следующий тик синка посчитает),
  // false = у символа не хватило истории свечей.
  ok: boolean | null;
  computedAt: string | null;
  entryPrice: number | null;
  atrPct: number | null;
  rsi: number | null;
  volRel: number | null;
  ema200Above: boolean | null;
  trend4h: string | null;
  rangePos1h: number | null;
  rangePos4h: number | null;
  rangePos1d: number | null;
}
