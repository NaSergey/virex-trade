import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';
import type { Direction, ExitReason } from '../backtest-math';

export class CreateSessionDto {
  @IsNumber()
  @Min(100)
  @Max(10_000_000)
  startBalance: number;

  @IsBoolean()
  hideDate: boolean;

  @IsBoolean()
  hidePrice: boolean;
}

export class AdvanceDto {
  @IsISO8601()
  cursorTime: string;
}

export class OpenTradeDto {
  @IsIn(['long', 'short'])
  direction: Direction;

  @IsISO8601()
  entryTime: string;

  @IsPositive()
  entryPrice: number;

  /** Обязателен: сделка без стопа в бектесте не принимается. */
  @IsPositive()
  stopLoss: number;

  @IsOptional()
  @IsPositive()
  takeProfit?: number;

  @IsNumber()
  @Min(0.01)
  @Max(100)
  riskPct: number;

  @IsNumber()
  @Min(1)
  @Max(100)
  leverage: number;

  /** Уровень сетки, который эту сделку и породил — сработавшая строка удаляется
   * тем же запросом, атомарно: раздельные вызовы оставляли бы окно, где сеть
   * оборвалась между открытием и удалением, и уровень сработал бы повторно. */
  @IsOptional()
  @IsString()
  entryOrderId?: string;
}

export class ModifyTradeDto {
  @IsOptional()
  @IsPositive()
  stopLoss?: number;

  /** null — убрать тейк; IsOptional пропускает и null, и отсутствие поля. */
  @IsOptional()
  @IsPositive()
  takeProfit?: number | null;
}

export class AddToTradeDto {
  @IsISO8601()
  entryTime: string;

  @IsPositive()
  entryPrice: number;

  @IsNumber()
  @Min(0.01)
  @Max(100)
  riskPct: number;

  /** См. OpenTradeDto.entryOrderId — тот же приём атомарного удаления сработавшего уровня. */
  @IsOptional()
  @IsString()
  entryOrderId?: string;
}

export class SetLeverageDto {
  @IsNumber()
  @Min(1)
  @Max(100)
  leverage: number;
}

export class CreateCloseOrderDto {
  @IsPositive()
  price: number;

  @IsPositive()
  qty: number;
}

export class CloseTradeDto {
  @IsISO8601()
  exitTime: string;

  @IsPositive()
  exitPrice: number;

  @IsIn(['stop', 'take', 'manual', 'finish', 'limit'])
  reason: ExitReason;

  @IsOptional()
  @IsPositive()
  qty?: number;

  @IsOptional()
  @IsString()
  closeOrderId?: string;
}

export class CreateEntryOrdersDto {
  @IsIn(['long', 'short'])
  direction: Direction;

  @IsPositive()
  stopLoss: number;

  @IsOptional()
  @IsPositive()
  takeProfit?: number;

  /** Доля риска на КАЖДЫЙ уровень — общий риск сетки уже поделён на клиенте. */
  @IsNumber()
  @Min(0.01)
  @Max(100)
  riskPct: number;

  @IsNumber()
  @Min(1)
  @Max(100)
  leverage: number;

  /** Цена каждого уровня сетки, по одной строке на цену. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsPositive({ each: true })
  prices: number[];
}

export class SetBacktestTagsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tagIds: string[];
}
