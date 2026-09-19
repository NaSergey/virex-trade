/**
 * Терминал сессии: график, панель ордера, позиции, ордера, рисование и итог.
 *
 * Живёт в `widgets/`, а не в `views/backtest/`, потому что нужен двум
 * страницам — бектесту и турниру. Внутри он о турнирах ничего не знает:
 * турнирную сессию отличает поле `tournament` в её деталях.
 */
export { SessionScreen } from './components/SessionScreen';
export { SummaryCells } from './components/SummaryCells';
export { useBacktestSessions, useBacktestStats, useCreateSession, useDeleteSession } from './api/hooks';
export type { DataSource, SessionDetail, SessionListItem } from './api/types';
export { pruneDrawings } from './lib/drawings/store';
