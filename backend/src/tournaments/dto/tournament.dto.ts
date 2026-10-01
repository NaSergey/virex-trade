import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { MAX_COINS_AMOUNT } from '../../coins/coins.config';
import {
  DURATIONS_MIN,
  MAX_PLAYERS,
  MAX_WINNERS,
  MIN_PLAYERS,
  TEAM_SIZE_MAX,
  TEAM_SIZE_MIN,
} from '../tournament.config';

export class CreateTournamentDto {
  @IsString()
  @Length(2, 60)
  name: string;

  /** Закрытый по умолчанию: попасть в общий список — осознанный выбор. */
  @IsOptional()
  @IsIn(['public', 'private'])
  visibility?: 'public' | 'private';

  /** Арена (на двоих — дуэль) или команды. По умолчанию — арена. */
  @IsOptional()
  @IsIn(['arena', 'teams'])
  format?: 'arena' | 'teams';

  /**
   * Размер команды — обязателен у команд. Места, число победителей и доли у
   * команд выводит сервер: `maxPlayers = 2 × teamSize`, фонд — стороне.
   */
  @IsOptional()
  @IsInt()
  @Min(TEAM_SIZE_MIN)
  @Max(TEAM_SIZE_MAX)
  teamSize?: number;

  @IsInt()
  @Min(MIN_PLAYERS)
  @Max(MAX_PLAYERS)
  maxPlayers: number;

  /** Границы депозита — те же, что у сессии бектеста. */
  @IsNumber()
  @Min(100)
  @Max(10_000_000)
  startBalance: number;

  @IsInt()
  @IsIn([...DURATIONS_MIN])
  durationMin: number;

  /**
   * Время старта (ISO). Нет — турнир стартует, когда готовы все. Границы
   * проверяет `startTimeFrom` в сервисе: здесь — только форма.
   */
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  /** Взнос каждого участника в монетах; 0 — бесплатный турнир. */
  @IsInt()
  @Min(0)
  @Max(MAX_COINS_AMOUNT)
  entryFee: number;

  /** Сколько создатель кладёт в фонд от себя сверх взноса. */
  @IsInt()
  @Min(0)
  @Max(MAX_COINS_AMOUNT)
  prizeBonus: number;

  @IsInt()
  @Min(1)
  @Max(MAX_WINNERS)
  winnersCount: number;

  /**
   * Проценты по местам. Согласованность с `winnersCount` и остальные правила
   * проверяет `validateShares` в сервисе: здесь — только форма.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_WINNERS)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(100, { each: true })
  @Type(() => Number)
  payoutShares: number[];
}

/**
 * Готовность участника — значением, а не двумя адресами (`/ready`,
 * `/unready`): это одно состояние с двумя значениями, и отдельный адрес под
 * каждое означал бы два места, где оно меняется.
 */
export class ReadyDto {
  @IsBoolean()
  ready: boolean;
}

/** Вход в турнир. У командного — в какую команду: 0 — A, 1 — B. */
export class JoinDto {
  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  team?: number;
}

/** Перестановка игрока создателем в другую команду (только в наборе). */
export class MoveTeamDto {
  @IsString()
  userId: string;

  @IsInt()
  @IsIn([0, 1])
  team: number;
}
