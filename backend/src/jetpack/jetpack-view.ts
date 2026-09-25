import { BET_MS, BETS_SHOWN, MAX_BET, MAX_X100, MIN_AUTO_X100, MIN_BET, RATE } from './jetpack.config';

export type Phase = 'idle' | 'betting' | 'flying' | 'crashed';

/** Ставка раунда в памяти процесса — зеркало строки `JetpackBet` плюс имя игрока. */
export interface RuntimeBet {
  id: string;
  userId: string;
  name: string | null;
  amount: number;
  autoX100: number | null;
  cashoutX100: number | null;
  payout: number | null;
}

/** Всё, из чего строится вид: копия рантайма на момент рассылки. */
export interface Snapshot {
  phase: Phase;
  roundId: string | null;
  launchAt: number | null;
  launchedAt: number | null;
  /** Есть с момента взлёта, но в вид попадает только после краша. */
  crashX100: number | null;
  history: number[];
  bets: RuntimeBet[];
}

/**
 * Единственное место, решающее, что игроку видно. Точки краша нет, пока
 * ракета летит; чужих целей автовывода нет вовсе — это стратегия игрока, а
 * не факт раунда. Свою строку клиент узнаёт по `mine`, а не по userId: чужие
 * id наружу не отдаются.
 *
 * `serverNow` — часы сервера на момент сборки: клиент считает множитель от
 * них, а не от своих, иначе расхождение часов сдвигало бы весь полёт.
 * `rate` — темп роста, чтобы формула множителя не жила второй копией во фронте.
 */
export function buildView(s: Snapshot, userId: string, now: number) {
  const mine = s.bets.find((b) => b.userId === userId) ?? null;
  const rows = [...s.bets]
    .sort((a, b) => Number(b.userId === userId) - Number(a.userId === userId) || b.amount - a.amount)
    .slice(0, BETS_SHOWN)
    .map((b) => ({
      name: b.name,
      amount: b.amount,
      cashoutX100: b.cashoutX100,
      payout: b.payout,
      mine: b.userId === userId,
    }));
  const flown = s.phase === 'flying' || s.phase === 'crashed';
  return {
    phase: s.phase,
    roundId: s.roundId,
    serverNow: now,
    launchAt: s.phase === 'betting' ? s.launchAt : null,
    launchedAt: flown ? s.launchedAt : null,
    crashX100: s.phase === 'crashed' ? s.crashX100 : null,
    rate: RATE,
    betMs: BET_MS,
    history: s.history,
    players: s.bets.length,
    totalBet: s.bets.reduce((n, b) => n + b.amount, 0),
    bets: rows,
    me: mine
      ? { amount: mine.amount, autoX100: mine.autoX100, cashoutX100: mine.cashoutX100, payout: mine.payout }
      : null,
    limits: { minBet: MIN_BET, maxBet: MAX_BET, minAutoX100: MIN_AUTO_X100, maxAutoX100: MAX_X100 },
  };
}

export type JetpackView = ReturnType<typeof buildView>;
