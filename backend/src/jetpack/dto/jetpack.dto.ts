import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { MAX_BET, MAX_X100, MIN_AUTO_X100, MIN_BET } from '../jetpack.config';

/** Лимиты повторно проверяет `JetpackService.bet` — здесь форма и границы. */
export class JetpackBetDto {
  @IsInt()
  @Min(MIN_BET)
  @Max(MAX_BET)
  amount: number;

  /** Цель автовывода множителем (2.5 = 2.50x), два знака. Нет — только ручной вывод. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(MIN_AUTO_X100 / 100)
  @Max(MAX_X100 / 100)
  autoCashout?: number;
}
