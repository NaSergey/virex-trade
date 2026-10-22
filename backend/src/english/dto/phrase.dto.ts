import { Matches } from 'class-validator';
import { DAY } from './day';

/**
 * Тело `POST /api/admin/english/phrases` (фраза диктанта или произношения) и
 * `POST /api/admin/english/quiz` (ответ в тесте) — только местная дата.
 */
export class PhraseDto {
  @Matches(DAY)
  day!: string;
}
