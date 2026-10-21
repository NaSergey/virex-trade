import {
  IsDateString,
  IsInt,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Тело `PUT /api/admin/english/cards` — состояние карточки после ответа. id —
 * в теле, а не в адресе: у слов книги он бывает фразой со слешем («turn left /
 * right»), а `%2F` в пути прокси вправе раскодировать. Состояние считает фронт
 * (`views/english/model/srs.ts`), здесь — только пределы, чтобы испорченное
 * состояние не легло в базу.
 */
export class CardStateDto {
  /** `<раздел>:<слово>` у слов книги, `my:<id>` у своих. */
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  cardId!: string;

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
