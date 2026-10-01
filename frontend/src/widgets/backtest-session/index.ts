/**
 * Терминал: график, панель ордера, позиции, ордера, рисование и итог.
 *
 * Живёт в `widgets/`, а не в `views/backtest/`, потому что нужен нескольким
 * страницам — бектесту, турниру и биржевому терминалу. Экран один на все три
 * (`Terminal`): ему подставляют счёт в форме сессии и набор действий, а
 * исполняет ли их наш движок или биржа, он не знает.
 *
 * Бектест и турнир берут `SessionScreen` — он сам грузит сессию и отдаёт её
 * терминалу с действиями нашего сервера. Биржевой терминал собирает снимок
 * счёта и действия биржи сам и рендерит тот же `Terminal`.
 */
export { SessionScreen, Terminal, type TerminalProps } from './components/SessionScreen';
export { SummaryCells } from './components/SummaryCells';
export { TerminalSkeleton } from './components/TerminalSkeleton';
export { useBacktestSessions, useBacktestStats, useCreateSession, useDeleteSession } from './api/hooks';
export {
  DEFAULT_SYMBOL,
  type BacktestCloseOrder,
  type BacktestEntryOrder,
  type BacktestTrade,
  type DataSource,
  type Direction,
  type LiveSymbol,
  type SessionDetail,
  type SessionListItem,
  type StatsSource,
} from './api/types';
export type { TerminalAction, TerminalActions } from './model/actions';
export type { LiveSource } from './model/useLiveFeed';
export { fromApi, type ApiCandle } from './lib/candles';
export { EXCHANGE_DRAWINGS, pruneDrawings } from './lib/drawings/store';
export type { TerminalSound } from './lib/sounds';
