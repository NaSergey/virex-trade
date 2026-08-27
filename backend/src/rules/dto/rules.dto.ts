import { IsBoolean, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpsertRuleDto {
  @IsIn(['lte', 'gte'])
  operator: 'lte' | 'gte';

  @IsNumber()
  @Min(0)
  @Max(1000000)
  threshold: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
