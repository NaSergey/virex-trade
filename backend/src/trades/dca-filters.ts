// Entry-filter model for the DCA bot ("условия открытия сделки").
// A deal opens only when EVERY filter in the bot's list passes. Each filter
// compares one numeric indicator metric on its own timeframe against a value,
// optionally on the last CLOSED bar (barClose) instead of the forming one.

export const DCA_FILTER_INDICATORS = [
  'rsi', // RSI 14, 0..100
  'adx', // ADX 14, trend strength
  'bb_pctb', // Bollinger %B * 100: 0 = at lower band, 100 = at upper, <0 = below lower
  'ema_spread', // (EMA20 - EMA50) / EMA50 * 100: >0 uptrend, <0 downtrend
  'atr_pct', // ATR14 / price * 100: volatility
] as const;
export type DcaFilterIndicator = (typeof DCA_FILTER_INDICATORS)[number];

export const DCA_FILTER_TIMEFRAMES = [
  '1',
  '5',
  '15',
  '30',
  '60',
  '240',
  'D',
] as const;

export interface DcaFilterConfig {
  indicator: DcaFilterIndicator;
  timeframe: string; // Bybit kline interval
  op: 'lt' | 'gt';
  value: number;
  barClose?: boolean; // evaluate on the last closed candle (drop the forming one)
}

export interface DcaFilterResult extends DcaFilterConfig {
  current: number | null; // metric value now (null = not enough candle data)
  passed: boolean;
}

// Human-readable RU labels used in event logs.
export const DCA_INDICATOR_LABEL: Record<DcaFilterIndicator, string> = {
  rsi: 'RSI',
  adx: 'ADX',
  bb_pctb: 'Боллинджер %B',
  ema_spread: 'EMA20−EMA50, %',
  atr_pct: 'ATR, %',
};

export function describeFilter(f: DcaFilterConfig): string {
  const tf = f.timeframe === 'D' ? '1D' : `${f.timeframe}m`;
  return `${DCA_INDICATOR_LABEL[f.indicator] ?? f.indicator}(${tf}) ${f.op === 'lt' ? '<' : '>'} ${f.value}`;
}

// Ready-made presets (long entries on dips). Conservative waits for a deep,
// multi-timeframe oversold without a strong trend; aggressive fires on any
// modest dip. Values are start points — the UI lets the user edit each filter.
export const DCA_FILTER_PRESETS: Record<
  'conservative' | 'moderate' | 'aggressive',
  { label: string; filters: DcaFilterConfig[] }
> = {
  conservative: {
    label: 'Консервативный',
    filters: [
      { indicator: 'rsi', timeframe: '5', op: 'lt', value: 30, barClose: true },
      {
        indicator: 'rsi',
        timeframe: '15',
        op: 'lt',
        value: 35,
        barClose: true,
      },
      { indicator: 'rsi', timeframe: '60', op: 'lt', value: 45 },
      {
        indicator: 'bb_pctb',
        timeframe: '5',
        op: 'lt',
        value: 5,
        barClose: true,
      },
      { indicator: 'bb_pctb', timeframe: '15', op: 'lt', value: 15 },
      { indicator: 'adx', timeframe: '60', op: 'lt', value: 30 },
      { indicator: 'ema_spread', timeframe: '240', op: 'gt', value: -2 },
    ],
  },
  moderate: {
    label: 'Умеренный',
    filters: [
      { indicator: 'rsi', timeframe: '5', op: 'lt', value: 35, barClose: true },
      { indicator: 'rsi', timeframe: '15', op: 'lt', value: 42 },
      {
        indicator: 'bb_pctb',
        timeframe: '5',
        op: 'lt',
        value: 15,
        barClose: true,
      },
      { indicator: 'adx', timeframe: '60', op: 'lt', value: 35 },
    ],
  },
  aggressive: {
    label: 'Агрессивный',
    filters: [
      { indicator: 'rsi', timeframe: '5', op: 'lt', value: 45, barClose: true },
      { indicator: 'rsi', timeframe: '15', op: 'lt', value: 55 },
      { indicator: 'bb_pctb', timeframe: '5', op: 'lt', value: 35 },
      { indicator: 'adx', timeframe: '60', op: 'lt', value: 45 },
    ],
  },
};
