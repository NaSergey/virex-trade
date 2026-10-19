import { IsIn, IsInt } from 'class-validator';
import { STAKES } from '../race.config';
import { CAR_IDS, type CarId } from '../sim';

/** Ставку и машину повторно проверяет `RaceService.join` — здесь форма. */
export class RaceJoinDto {
  @IsInt()
  @IsIn(STAKES)
  stake: number;

  @IsIn([...CAR_IDS])
  car: CarId;
}
