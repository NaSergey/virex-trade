import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Was an inline `@Body() body: { ... }` object literal. The global
// ValidationPipe only validates class metatypes, so a plain-object annotation
// silently opted this endpoint — which moves TP/SL on a live position — out of
// validation entirely, `whitelist`/`forbidNonWhitelisted` included.
export class SetTradingStopDto {
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @IsIn(['long', 'short'])
  positionType: 'long' | 'short';

  @IsString()
  @IsOptional()
  takeProfit?: string;

  @IsString()
  @IsOptional()
  stopLoss?: string;
}
