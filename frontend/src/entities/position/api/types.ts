// Открытая позиция с активной биржи, нормализованная бэкендом (см.
// OpenPosition в exchange.types.ts) — числа остаются строками, как их отдаёт
// биржа, чтобы не округлить размеры и цены до отображения.
//
// Направление приходит уже как long/short: раньше здесь было биржевое
// `side: 'Buy' | 'Sell'`, и каждый потребитель переводил его сам.
//
// Время открытия биржа не сообщает достоверно, поэтому «сколько времени в
// позиции» считается по нашим часам (OpenPositionSeen, см. usePositionTags →
// openedAt), а не по полю из ответа.
export interface ExchangePosition {
  symbol: string;
  direction: 'long' | 'short';
  size: string;
  // Ниже — то, что рисует таблица. Биржа, которая поля не отдаёт, его опускает.
  avgPrice?: string;
  markPrice?: string;
  positionValue?: string;
  unrealisedPnl?: string;
  leverage?: string;
  liqPrice?: string;
  takeProfit?: string;
  stopLoss?: string;
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
