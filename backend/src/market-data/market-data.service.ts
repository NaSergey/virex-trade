import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SYMBOL, TIMEFRAMES, isValidTimeframe } from './timeframes';

export interface Candle {
  time: Date; // время ОТКРЫТИЯ свечи
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleQuery {
  symbol?: string;
  timeframe: number;
  from?: Date;
  to?: Date;
  /** Не задан — вернуть весь диапазон. Верхнюю границу ставит контроллер. */
  limit?: number;
}

export interface Coverage {
  timeframe: number;
  from: Date | null;
  to: Date | null;
}

/**
 * Единственный читатель таблицы `price_candles` в проекте. Все остальные —
 * market-events сегодня, терминал бектеста завтра — ходят сюда, а не в Prisma.
 */
@Injectable()
export class MarketDataService {
  constructor(private readonly prisma: PrismaService) {}

  /** Всегда отдаёт свечи ПО ВОЗРАСТАНИЮ времени, независимо от параметров. */
  async getCandles(q: CandleQuery): Promise<Candle[]> {
    if (!isValidTimeframe(q.timeframe)) {
      throw new BadRequestException(
        `Неизвестный таймфрейм: ${q.timeframe}. Допустимы: ${TIMEFRAMES.join(', ')}`,
      );
    }

    // Без from «последние N свечей» надо брать с хвоста: asc + take отдал бы
    // начало истории, то есть 2018 год вместо свежего графика.
    const newestFirst = q.limit != null && q.from == null;

    const rows = await this.prisma.priceCandle.findMany({
      where: {
        // `|| SYMBOL`, а не `??`: пустая строка из `?symbol=` — тоже «не задан».
        symbol: q.symbol || SYMBOL,
        timeframe: q.timeframe,
        ...(q.from || q.to ? { time: { gte: q.from, lte: q.to } } : {}),
      },
      orderBy: { time: newestFirst ? 'desc' : 'asc' },
      take: q.limit ?? undefined,
      select: { time: true, open: true, high: true, low: true, close: true, volume: true },
    });

    return newestFirst ? rows.reverse() : rows;
  }

  /**
   * Границы имеющейся истории по каждому таймфрейму. Нужен терминалу бектеста:
   * чтобы выдать случайный отрезок, надо знать, между какими датами бросать
   * кубик — и знать это отдельно по каждому ТФ, потому что пока идёт первый
   * прогон синка, у 1d история уже с 2018, а у 1m ещё на середине пути.
   */
  async getCoverage(symbol?: string): Promise<Coverage[]> {
    // `||`, а не дефолт параметра: дефолт параметра не ловит пустую строку
    // из `?symbol=`, а `??` — только `undefined`/`null`.
    const sym = symbol || SYMBOL;
    return Promise.all(
      TIMEFRAMES.map(async (timeframe) => {
        const [first, last] = await Promise.all([
          this.prisma.priceCandle.findFirst({
            where: { symbol: sym, timeframe },
            orderBy: { time: 'asc' },
            select: { time: true },
          }),
          this.prisma.priceCandle.findFirst({
            where: { symbol: sym, timeframe },
            orderBy: { time: 'desc' },
            select: { time: true },
          }),
        ]);
        return { timeframe, from: first?.time ?? null, to: last?.time ?? null };
      }),
    );
  }
}
