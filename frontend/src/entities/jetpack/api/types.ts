export type JetpackPhase = 'idle' | 'betting' | 'flying' | 'crashed';

export interface JetpackBetRow {
  name: string | null;
  amount: number;
  cashoutX100: number | null;
  payout: number | null;
  mine: boolean;
}

export interface JetpackMyBet {
  amount: number;
  autoX100: number | null;
  cashoutX100: number | null;
  payout: number | null;
}

/** Вид с сервера (`backend/src/jetpack/jetpack-view.ts`). Множители — в сотых. */
export interface JetpackWire {
  phase: JetpackPhase;
  roundId: string | null;
  serverNow: number;
  launchAt: number | null;
  launchedAt: number | null;
  crashX100: number | null;
  rate: number;
  betMs: number;
  history: number[];
  players: number;
  totalBet: number;
  bets: JetpackBetRow[];
  me: JetpackMyBet | null;
  limits: { minBet: number; maxBet: number; minAutoX100: number; maxAutoX100: number };
}

/**
 * Вид плюс сдвиг часов: `Date.now() + offset` — оценка серверного времени.
 * Сдвиг снимается в момент получения, задержка сети в него не входит — клиент
 * отстаёт от сервера на неё, и показанный множитель не больше того, что
 * насчитает сервер по нажатию.
 */
export interface JetpackView extends JetpackWire {
  offset: number;
}
