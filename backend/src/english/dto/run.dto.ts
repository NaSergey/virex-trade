import {
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Исход забега. */
export const OUTCOMES = ['win', 'dead', 'quit'] as const;

/**
 * Тело `POST /api/admin/english/runs` — законченный забег игры. id выдаёт
 * клиент: забег, не ушедший с первого раза, досылается, и повтор не задвоит
 * его. Размер `stats` проверяет сервис — валидатор JSON по длине не меряет.
 */
export class RunDto {
  @Matches(/^[a-z0-9]{8,40}$/)
  id!: string;

  @IsISO8601()
  startedAt!: string;

  @IsISO8601()
  finishedAt!: string;

  @IsString()
  @MaxLength(20)
  character!: string;

  @IsInt()
  @Min(0)
  @Max(8)
  fog!: number;

  @IsIn(OUTCOMES)
  outcome!: (typeof OUTCOMES)[number];

  @IsInt()
  @Min(0)
  @Max(10)
  depth!: number;

  @IsInt()
  @Min(0)
  @Max(100_000)
  score!: number;

  @IsObject()
  stats!: Record<string, unknown>;
}
