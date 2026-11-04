import { IsInt, IsObject, Min } from 'class-validator';

/**
 * Тело `PUT /api/admin/english/hold` — состояние игры «Ashen Hold» целиком и момент сохранения
 * по часам клиента (мс). Размер `state` проверяет сервис — валидатор JSON по длине не меряет.
 */
export class HoldDto {
  @IsObject()
  state!: Record<string, unknown>;

  @IsInt()
  @Min(0)
  savedAt!: number;
}
