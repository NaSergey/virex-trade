import { IsBoolean, IsObject, IsOptional } from 'class-validator';

/**
 * Частичная правка настроек: страница шлёт только то, что человек тронул.
 *
 * Содержимое `items` намеренно не описано вложенными DTO. Ключи там —
 * произвольные строки (ключи реестра), и любое значение всё равно проходит
 * через applyPatch, который сверяется с реестром: неизвестный сигнал
 * отбрасывается, несуществующий индекс пресета откатывается на дефолтный.
 * Вторая проверка теми же правилами, но декораторами, только разошлась бы с
 * первой.
 */
export class PatchNotificationsDto {
  @IsOptional()
  @IsObject()
  items?: Record<string, { enabled?: boolean; preset?: number }>;

  @IsOptional()
  @IsBoolean()
  quietHours?: boolean;
}
