import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class AmendOrderDto {
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @IsOptional()
  price?: string;

  @IsString()
  @IsOptional()
  qty?: string;
}
