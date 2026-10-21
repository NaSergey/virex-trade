import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DAY } from './day';

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

  /** Местная дата ответа — в счётчик занятий дня. */
  @IsOptional()
  @Matches(DAY)
  day?: string;
}
