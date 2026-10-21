import { IsDateString, IsInt, IsNumber, Max, Min } from 'class-validator';

/**
 * Тело `PUT /api/admin/english/cards/:cardId` — состояние карточки после
 * ответа. Считает его фронт (`views/english/model/srs.ts`), здесь — только
 * пределы, чтобы испорченное состояние не легло в базу.
 */
export class CardStateDto {
  @IsDateString()
  due!: string;

  @IsNumber()
  @Min(0)
  @Max(365)
  interval!: number;

  @IsNumber()
  @Min(1.3)
  @Max(3)
  ease!: number;

  @IsInt()
  @Min(0)
  reps!: number;

  @IsInt()
  @Min(0)
  lapses!: number;

  @IsDateString()
  firstAt!: string;
}
