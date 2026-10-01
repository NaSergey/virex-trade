/** `cancelled` — назначенное время пришло, а участник один: взнос возвращён. */
export type TournamentStatus = 'lobby' | 'running' | 'finished' | 'cancelled';
export type TournamentVisibility = 'public' | 'private';
/** Арена (на двоих — дуэль) или две команды. */
export type TournamentFormat = 'arena' | 'teams';

/** Общие поля турнира — одни у списка, общего каталога и самой страницы. */
export interface TournamentBase {
  id: string;
  name: string;
  status: TournamentStatus;
  visibility: TournamentVisibility;
  format: TournamentFormat;
  /** Размер команды — только у команд; мест тогда 2 × teamSize. */
  teamSize: number | null;
  maxPlayers: number;
  startBalance: number;
  durationMin: number;
  entryFee: number;
  prizeBonus: number;
  winnersCount: number;
  payoutShares: number[];
  createdAt: string;
  /** Назначенное время старта; null — турнир стартует, когда готовы все. */
  startsAt: string | null;
  startedAt: string | null;
  endsAt: string | null;
  /** Когда подведены итоги или турнир отменён. */
  finishedAt: string | null;
}

/** Как смотрящий связан с турниром: создал, играет или смотрит со стороны. */
export type BoardRelation = 'created' | 'joined' | 'other';

/**
 * Строка общей таблицы турниров. Порядок строк задаёт сервер: созданные мной,
 * потом где я играю, потом чужие публичные.
 */
export interface BoardTournament extends TournamentBase {
  relation: BoardRelation;
  players: number;
  creatorName: string | null;
  /** Собранный сейчас — то же число, что в шапке окна турнира. */
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
 * Сводка участника по закрытым сделкам — итог, в который открытое не входит.
 * Сами сделки, открытые тоже, видны в ленте (`FeedTrade`).
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
  /** Команда: 0 — A, 1 — B; у арены — null. */
  team: number | null;
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
    team: number | null;
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

/**
 * Строка ленты «Сделки игроков»: сделка идущего турнира — публичного или
 * того, где смотрящий играет. Открытая — без `exitTime` и `pnl`.
 */
export interface FeedTrade {
  id: string;
  tournamentId: string;
  tournamentName: string;
  userId: string;
  playerName: string | null;
  symbol: string;
  direction: 'long' | 'short';
  leverage: number;
  entryTime: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number | null;
  exitTime: string | null;
  pnl: number | null;
}

export interface CreateTournamentInput {
  name: string;
  visibility: TournamentVisibility;
  format: TournamentFormat;
  /** Только у команд. */
  teamSize?: number;
  maxPlayers: number;
  startBalance: number;
  durationMin: number;
  entryFee: number;
  prizeBonus: number;
  winnersCount: number;
  payoutShares: number[];
  /** ISO; нет — старт по готовности всех. */
  startsAt?: string;
}
