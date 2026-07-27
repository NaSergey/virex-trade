import { IsString, IsIn, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @IsString()
  @IsNotEmpty()
  entryPrice: string;

  @IsString()
  @IsNotEmpty()
  stopLoss: string;

  @IsString()
  @IsNotEmpty()
  positionSizeCrypto: string;

  @IsIn(['long', 'short', 'neutral'])
  positionType: 'long' | 'short' | 'neutral';

  // Optional leverage to apply before placing the order.
  @IsString()
  @IsOptional()
  leverage?: string;
}

