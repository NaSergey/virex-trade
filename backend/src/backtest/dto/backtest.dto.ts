import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { LIVE_SYMBOL_IDS } from '../../market-data/symbols';
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

  /** Не задан — реальная история. */
  @IsOptional()
  @IsIn(['real', 'synthetic', 'live'])
  dataSource?: 'real' | 'synthetic' | 'live';
}

export class AdvanceDto {
  @IsISO8601()
  cursorTime: string;
}

export class OpenTradeDto {
  /** Монета сделки; не задана — BTC. Не-BTC принимает только эфир. */
  @IsOptional()
  @IsIn(LIVE_SYMBOL_IDS)
  symbol?: string;

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
  /** Плечо задаётся на монету, как на бирже; не задана — BTC. */
  @IsOptional()
  @IsIn(LIVE_SYMBOL_IDS)
  symbol?: string;

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

/** Сетка фиксации позиции: цены лимитов закрытия и «стоп за тейками». */
export class CreateCloseGridDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsPositive({ each: true })
  prices: number[];

  /** Объёмы уровней в монете — закреплённые руками и поделённые остальными; нет — поровну. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsNumber({}, { each: true })
  @IsPositive({ each: true })
  qtys?: number[];

  /** Цель стопа после исполнения уровня; 0 — правило (вход, дальше предыдущий тейк). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  stops?: number[];

  @IsBoolean()
  stopFollow: boolean;
}

/** Новая цена висящего ордера — перенос жестом на графике. */
export class MoveOrderDto {
  @IsPositive()
  price: number;
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
  /** Монета сетки; не задана — BTC. */
  @IsOptional()
  @IsIn(LIVE_SYMBOL_IDS)
  symbol?: string;

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

  /** Риск каждого уровня отдельно — объёмы из таблицы «Сетки»; по одному на цену. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsNumber({}, { each: true })
  @Min(0.0001, { each: true })
  @Max(100, { each: true })
  riskPcts?: number[];

  /** Цель стопа после исполнения уровня; 0 — стоп не двигается. По одному на цену. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  stopsAfter?: number[];
}

export class SetBacktestTagsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tagIds: string[];
}

/** Запуск грид-бота (спека 2026-10-09-range-indicator-and-grid-bot-design.md). */
export class StartBotDto {
  /** Монета; не задана — BTC. */
  @IsOptional()
  @IsIn(LIVE_SYMBOL_IDS)
  symbol?: string;

  @IsPositive()
  lower: number;

  @IsPositive()
  upper: number;

  @IsPositive()
  stopLoss: number;

  @IsInt()
  @Min(2)
  @Max(20)
  levels: number;

  /** Общий риск сетки: потеря, если исполнились все покупки и сработал стоп. */
  @IsNumber()
  @Min(0.01)
  @Max(100)
  riskPct: number;

  @IsNumber()
  @Min(1)
  @Max(100)
  leverage: number;

  /** Момент и цена запуска — как у входа по рынку; в эфире их ставит сервер. */
  @IsISO8601()
  entryTime: string;

  @IsPositive()
  entryPrice: number;

  /** Доли уровней снизу вверх, в сумме 1; нет — поровну. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsPositive({ each: true })
  shares?: number[];

  /** «Стоп после тейка»: цель стопа после продажи уровня; 0 — стоп стоит. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  stopsAfter?: number[];

  @IsOptional()
  @IsBoolean()
  stopFollow?: boolean;
}
