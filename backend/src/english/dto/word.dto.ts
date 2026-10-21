import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Не пусто и не одни пробелы: после обрезки слово сохранилось бы пустым. */
const FILLED = /\S/;

/** Тело `POST /api/admin/english/words` — своё слово владельца. */
export class WordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(FILLED)
  en!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(FILLED)
  ru!: string;
}
