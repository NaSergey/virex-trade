import { IsString, MaxLength, MinLength } from 'class-validator';

/** Тело `POST /api/admin/english/words` — своё слово владельца. */
export class WordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  en!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  ru!: string;
}
