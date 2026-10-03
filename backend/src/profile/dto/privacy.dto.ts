import { IsBoolean } from 'class-validator';

/** Выключатель показа своих сделок на профиле. */
export class PrivacyDto {
  @IsBoolean()
  showTrades: boolean;
}
