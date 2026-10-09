import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * Символ уходит в запрос к бирже, поэтому формат проверяется уже здесь, до
 * сверки со списком инструментов: в строке запроса ему нечем навредить.
 */
const SYMBOL = /^[A-Z0-9]{2,24}$/;

/** Больше десяти ордеров одной сеткой панель и не ставит. */
const MAX_GRID = 10;

export class PlaceOrderDto {
  @Matches(SYMBOL)
  symbol: string;

  @IsIn(['long', 'short'])
  direction: 'long' | 'short';

  @IsIn(['market', 'limit'])
  kind: 'market' | 'limit';

  // Цены лимитов на вход: одна — одиночный ордер, несколько — сетка. У рыночного их нет.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_GRID)
  @IsNumber({}, { each: true })
  @IsPositive({ each: true })
  prices?: number[];

  // Риск НА ОРДЕР, в процентах баланса: сетку панель делит на уровни сама.
  @IsNumber()
  @Min(0.01)
  @Max(100)
  riskPct: number;

  // Риск каждого уровня сетки отдельно — объёмы из таблицы «Сетки»; по одному на цену.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_GRID)
  @IsNumber({}, { each: true })
  @Min(0.0001, { each: true })
  @Max(100, { each: true })
  riskPcts?: number[];

  // Не нужен только доливу позиции, у которой стоп уже стоит.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  stopLoss?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  takeProfit?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(200)
  leverage?: number;
}

export class MoveOrderDto {
  @Matches(SYMBOL)
  symbol: string;

  @IsNumber()
  @IsPositive()
  price: number;
}

export class SetLevelsDto {
  @Matches(SYMBOL)
  symbol: string;

  @IsIn(['long', 'short'])
  direction: 'long' | 'short';

  // Не задан — стоп позиции не трогается: у позиции, открытой мимо терминала,
  // его может не быть вовсе, и правка тейка не должна его требовать.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  stopLoss?: number;

  // null или отсутствует — снять тейк.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  takeProfit?: number | null;
}

export class CloseGridDto {
  @Matches(SYMBOL)
  symbol: string;

  @IsIn(['long', 'short'])
  direction: 'long' | 'short';

  // Цены лимитов закрытия — от первого тейка к последнему.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_GRID)
  @IsNumber({}, { each: true })
  @IsPositive({ each: true })
  prices: number[];

  // Объёмы уровней в монете (закреплённые руками и поделённые остальными); нет — поровну.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_GRID)
  @IsNumber({}, { each: true })
  @IsPositive({ each: true })
  qtys?: number[];

  // Цель стопа после исполнения уровня; 0 — правило (вход, дальше предыдущий тейк).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_GRID)
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  stops?: number[];

  // Стоп за тейками: после первого — в безубыток, дальше — на предыдущий (ведёт worker).
  @IsOptional()
  @IsBoolean()
  follow?: boolean;
}

export class ClosePositionDto {
  @Matches(SYMBOL)
  symbol: string;

  @IsIn(['long', 'short'])
  direction: 'long' | 'short';

  @IsIn(['market', 'limit'])
  kind: 'market' | 'limit';

  // Обязательна лимиту; рыночному не нужна.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  // Не задан — вся позиция.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  qty?: number;
}
