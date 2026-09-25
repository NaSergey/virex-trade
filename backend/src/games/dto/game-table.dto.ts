import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { MAX_COINS_AMOUNT } from '../../coins/coins.config';
import { GAME_TYPES, GameType } from '../games.config';

export class CreateGameTableDto {
  @IsIn(GAME_TYPES)
  gameType: GameType;

  @IsString()
  @Length(2, 60)
  name: string;

  /** Закрытый по умолчанию: попасть в общий список — осознанный выбор. */
  @IsOptional()
  @IsIn(['public', 'private'])
  visibility?: 'public' | 'private';

  @IsInt()
  @Min(1)
  @Max(MAX_COINS_AMOUNT)
  minBuyIn: number;

  @IsInt()
  @Min(1)
  @Max(MAX_COINS_AMOUNT)
  maxBuyIn: number;

  /**
   * Внешняя граница — 9 (максимум среди SEATS_RANGE). Точный диапазон под
   * конкретный gameType (нельзя проверить одним декоратором на два поля
   * сразу) проверяет `GamesService.create`.
   */
  @IsInt()
  @Min(1)
  @Max(9)
  maxSeats: number;

  /** Только покер, и там обязателен — проверяет `GamesService.create`. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_COINS_AMOUNT)
  bigBlind?: number;

  /** Только блэкджек, и там обязательны — проверяет `GamesService.create`. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_COINS_AMOUNT)
  minBet?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_COINS_AMOUNT)
  maxBet?: number;
}

export class JoinGameTableDto {
  @IsInt()
  @Min(1)
  @Max(MAX_COINS_AMOUNT)
  buyIn: number;
}
