import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Окно отчёта. Задаётся либо `days` (последние N суток), либо парой from/to;
 * from/to сильнее, если пришли обе границы.
 */
export class PeriodQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(730)
  days?: number;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  /**
   * Сдвиг часового пояса в минутах для нарезки на сутки (Москва = 180).
   * По умолчанию UTC — так же, как эти сутки нарезаны в БД.
   */
  @IsOptional()
  @IsInt()
  @Min(-840)
  @Max(840)
  tzOffsetMinutes?: number;
}

export const USER_SORT_FIELDS = [
  'lastSeenAt',
  'minutesOnSite',
  'activeMinutes',
  'sessions',
  'actions',
  'daysActive',
  'trades',
  'createdAt',
] as const;

export type UserSortField = (typeof USER_SORT_FIELDS)[number];

export class UsersQueryDto extends PeriodQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsIn(USER_SORT_FIELDS as unknown as string[])
  sort?: UserSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  /** Подстрока почты или имени. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class RetentionQueryDto {
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(26)
  weeks?: number;

  @IsOptional()
  @IsInt()
  @Min(-840)
  @Max(840)
  tzOffsetMinutes?: number;
}
