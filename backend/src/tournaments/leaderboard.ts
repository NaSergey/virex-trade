/**
 * Места в турнире. Считаются один раз, в финале: к этому моменту открытые
 * позиции уже закрыты движком по цене последней минутки, поэтому эквити равно
 * депозиту сессии, а слагаемое по открытым остаётся ради тех же чисел до
 * финала (например, при досрочном подведении итогов).
 *
 * Таблицы участников в продукте нет — место нужно выплатам и рейтингу игры.
 */
export interface ParticipantInput {
  userId: string;
  joinedAt: Date;
  /** Сессия участника; null — её почему-то нет, тогда и результата нет. */
  session: { balance: number } | null;
  openTrades: { direction: string; entryPrice: number; qty: number; closedQty: number }[];
  /** Цена, по которой оценивать открытое; null — оценивать нечем. */
  mark: number | null;
}

export interface RankedParticipant {
  userId: string;
  equity: number;
  /** С единицы, подряд, без ничьих. */
  place: number;
}

export function rankParticipants(input: ParticipantInput[]): RankedParticipant[] {
  return input
    .map((p) => ({ userId: p.userId, joinedAt: p.joinedAt, equity: equityOf(p) }))
    // Ничьей быть не может: фонд делится по местам, и два первых места делить
    // его не на что. Разводит время входа в турнир — оно всегда разное и не
    // зависит от того, как участник торговал.
    .sort((a, b) => b.equity - a.equity || a.joinedAt.getTime() - b.joinedAt.getTime())
    .map(({ userId, equity }, i) => ({ userId, equity, place: i + 1 }));
}

function equityOf(p: ParticipantInput): number {
  if (!p.session) return 0;
  if (p.mark == null) return p.session.balance;
  const unrealized = p.openTrades.reduce((sum, t) => {
    const sign = t.direction === 'long' ? 1 : -1;
    return sum + sign * (p.mark! - t.entryPrice) * (t.qty - t.closedQty);
  }, 0);
  return p.session.balance + unrealized;
}
