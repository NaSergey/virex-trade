import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_COINS_AMOUNT } from '../../coins/coins.config';

export class PokerActionDto {
  @IsIn(['fold', 'check', 'call', 'raise'])
  type: 'fold' | 'check' | 'call' | 'raise';

  /** Для рейза — итоговая ставка на улице, а не добавка к ней. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_COINS_AMOUNT)
  amount?: number;
}

export class PokerFlagsDto {
  @IsOptional()
  @IsBoolean()
  sitOut?: boolean;

  @IsOptional()
  @IsBoolean()
  foldAny?: boolean;
}
