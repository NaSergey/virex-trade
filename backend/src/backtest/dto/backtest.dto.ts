import {
  ArrayMaxSize,
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
  @IsPositive()
  entryPrice: number;

  @IsNumber()
  @Min(0.01)
  @Max(100)
  riskPct: number;
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

export class SetBacktestTagsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tagIds: string[];
}
