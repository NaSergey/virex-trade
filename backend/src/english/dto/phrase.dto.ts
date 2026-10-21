import { Matches } from 'class-validator';
import { DAY } from './day';

/** Тело `POST /api/admin/english/phrases` — фраза диктанта или произношения сделана. */
export class PhraseDto {
  @Matches(DAY)
  day!: string;
}
