import { IsIn, IsInt } from 'class-validator';
import { BETS } from '../slots.config';

export class SlotsSpinDto {
  @IsInt()
  @IsIn(BETS as unknown as number[])
  bet: number;
}
