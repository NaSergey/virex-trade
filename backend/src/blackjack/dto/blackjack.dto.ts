import { IsBoolean, IsIn, IsInt, Max, Min } from 'class-validator';
import { MAX_COINS_AMOUNT } from '../../coins/coins.config';
import type { BjActionType } from '../blackjack';

/** Лимиты стола и стек проверяет `BlackjackService.bet` — здесь только форма. */
export class BlackjackBetDto {
  @IsInt()
  @Min(1)
  @Max(MAX_COINS_AMOUNT)
  amount: number;
}

export class BlackjackActionDto {
  @IsIn(['hit', 'stand', 'double', 'split'])
  type: BjActionType;
}

export class BlackjackFlagsDto {
  @IsBoolean()
  sitOut: boolean;
}
