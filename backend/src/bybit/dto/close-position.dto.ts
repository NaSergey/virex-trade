import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// See SetTradingStopDto: this replaces an inline object-literal body type that
// the global ValidationPipe skipped, on an endpoint that closes a real position.
export class ClosePositionDto {
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @IsIn(['long', 'short'])
  positionType: 'long' | 'short';

  @IsIn(['Market', 'Limit'])
  orderType: 'Market' | 'Limit';

  // Required by Bybit for a Limit close; ignored for Market.
  @IsString()
  @IsOptional()
  price?: string;

  // Omitted = close the whole position.
  @IsString()
  @IsOptional()
  quantity?: string;
}
