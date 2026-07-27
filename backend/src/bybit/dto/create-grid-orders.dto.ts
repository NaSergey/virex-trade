import { IsString, IsIn, IsNotEmpty, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class GridOrderItemDto {
  @IsString()
  @IsNotEmpty()
  price: string;

  @IsString()
  @IsNotEmpty()
  quantity: string;
}

export class CreateGridOrdersDto {
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @IsIn(['long', 'short'])
  positionType: 'long' | 'short';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GridOrderItemDto)
  orders: GridOrderItemDto[];

  @IsString()
  takeProfit?: string;

  @IsString()
  stopLoss?: string;
}
