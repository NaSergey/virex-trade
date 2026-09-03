import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Сумма приходит СТРОКОЙ и остаётся строкой до разбора в целые единицы.
 * Число здесь означало бы double по дороге через JSON, а вся система
 * сопоставления платежей держится на точном равенстве сумм.
 *
 * Формат: до 7 целых знаков и не больше двух дробных — младшие знаки
 * зарезервированы под уникальный хвост, который выдаёт сервер.
 */
export class CreateDonationDto {
  @IsString()
  @MaxLength(16)
  @Matches(/^\d{1,7}(\.\d{1,2})?$/, {
    message: 'amount must be a positive number with at most 2 decimals',
  })
  amount: string;

  /**
   * Необязательная подпись к донату — показывается владельцу в сверке.
   * Ни на что в сопоставлении не влияет: memo в TRC20-переводе не доезжает,
   * и полагаться на него нельзя (см. комментарий в TronWatcherService).
   */
  @IsOptional()
  @IsString()
  @MaxLength(140)
  note?: string;
}
