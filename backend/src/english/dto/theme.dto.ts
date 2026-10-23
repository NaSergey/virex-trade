import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
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

  /** Слова сразу — тема из рекомендаций «Разбора» создаётся одним запросом. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  cards?: string[];
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
