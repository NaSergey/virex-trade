import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
import { DURATIONS_MIN, MAX_PLAYERS, MIN_PLAYERS } from '../tournament.config';

export class CreateTournamentDto {
  @IsString()
  @Length(2, 60)
  name: string;

  /** Закрытый по умолчанию: попасть в общий список — осознанный выбор. */
  @IsOptional()
  @IsIn(['public', 'private'])
  visibility?: 'public' | 'private';

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
  @Max(MAX_PLAYERS - 1)
  winnersCount: number;

  /**
   * Проценты по местам. Согласованность с `winnersCount` и остальные правила
   * проверяет `validateShares` в сервисе: здесь — только форма.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PLAYERS - 1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(100, { each: true })
  @Type(() => Number)
  payoutShares: number[];
}
