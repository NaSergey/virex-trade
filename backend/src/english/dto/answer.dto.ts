import { IsBoolean, IsString, MaxLength } from 'class-validator';

/** Тело `POST /api/admin/english/answers` — один ответ на упражнение. */
export class AnswerDto {
  @IsString()
  @MaxLength(60)
  itemId!: string;

  @IsString()
  @MaxLength(20)
  unit!: string;

  @IsBoolean()
  correct!: boolean;
}
