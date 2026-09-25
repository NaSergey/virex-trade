export type TournamentStatus = 'lobby' | 'running' | 'finished';
export type TournamentVisibility = 'public' | 'private';

/** Общие поля турнира — одни у списка, общего каталога и самой страницы. */
export interface TournamentBase {
  id: string;
  name: string;
  status: TournamentStatus;
  visibility: TournamentVisibility;
  maxPlayers: number;
  startBalance: number;
  durationMin: number;
  entryFee: number;
  prizeBonus: number;
  winnersCount: number;
  payoutShares: number[];
  createdAt: string;
  startedAt: string | null;
  endsAt: string | null;
}

/** Строка «моих турниров». */
export interface MyTournament extends TournamentBase {
  players: number;
  /** Нужен, чтобы решить, показывать ли кнопку досрочного финала прямо в строке. */
  creatorId: string | null;
}

/** Строка общего списка открытых турниров. */
export interface PublicTournament extends TournamentBase {
  players: number;
  creatorName: string | null;
  /** Фонд при полном наборе мест — сколько турнир обещает, а не собрал. */
  prizePool: number;
}

export interface TournamentParticipantView {
  userId: string;
  name: string | null;
}

export interface TournamentWinner extends TournamentParticipantView {
  place: number | null;
  prizeWon: number | null;
}

/**
 * Сводка участника по ЗАКРЫТЫМ сделкам. Ни направлений, ни открытых позиций
 * здесь нет намеренно: сторона чужой открытой сделки — это подсказка, по
 * которой играют вместо своей системы.
 */
export interface TournamentPlayerStats {
  trades: number;
  wins: number;
  winRate: number;
  totalR: number;
  avgR: number;
  pnl: number;
}

export interface TournamentPlayer extends TournamentParticipantView {
  /** Нажал ли «Я готов». Значит что-то только в лобби: турнир стартует, когда готовы все. */
  ready: boolean;
  /** null — сессии ещё нет, турнир в лобби. Это не то же самое, что нулевая сводка. */
  stats: TournamentPlayerStats | null;
}

/** Страница турнира целиком. */
export interface TournamentDetail {
  tournament: TournamentBase & { creatorName: string | null; players: number; prizePool: number };
  participants: TournamentPlayer[];
  /** Пусто, пока турнир не завершён: до финала мест не существует. */
  winners: TournamentWinner[];
  /** Свой итог — единственный результат, который участник видит поимённо. */
  me: {
    place: number | null;
    finalEquity: number | null;
    prizeWon: number | null;
    ready: boolean;
  } | null;
  isParticipant: boolean;
  isCreator: boolean;
  /** Сессия этого участника; null — он не играет или турнир ещё в лобби. */
  sessionId: string | null;
}

export interface RatingRow {
  place: number;
  userId: string;
  name: string;
  points: number;
  tournaments: number;
  wins: number;
}

export interface Rating {
  rows: RatingRow[];
  /** Строка смотрящего — только если он не попал в таблицу. */
  me: RatingRow | null;
}

export interface CreateTournamentInput {
  name: string;
  visibility: TournamentVisibility;
  maxPlayers: number;
  startBalance: number;
  durationMin: number;
  entryFee: number;
  prizeBonus: number;
  winnersCount: number;
  payoutShares: number[];
}
