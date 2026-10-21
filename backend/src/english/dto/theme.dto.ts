import {
  IsBoolean,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Тело `POST /api/admin/english/themes` — своя тема. */
export class ThemeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(/\S/)
  title!: string;
}

/** Тело `PUT /api/admin/english/themes/:id/words` — слово в тему или из неё. */
export class ThemeWordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  cardId!: string;

  @IsBoolean()
  on!: boolean;
}
