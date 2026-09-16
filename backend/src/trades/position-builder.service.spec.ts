import { PositionBuilderService } from './position-builder.service';
import type { PositionsResult } from '../exchanges/exchange.types';

/**
 * Простая база в памяти вместо Prisma: реальные объекты `where` этого
 * сервиса (включая `OR` на символ+`execTime.gte`, которые вводит T13) не
 * получится подсунуть настоящему Prisma-мок-фреймворку без риска молча
 * разойтись с фактическим SQL, а здесь фильтрация — часть того, что
 * проверяют тесты.
 */
function makeFakePrisma() {
  const executions: Array<{
    userId: string;
    exchange: string;
    symbol: string;
    side: string;
    qty: number;
    closedSize: number;
    orderId: string;
    execId: string;
    execTime: Date;
  }> = [];
  const trades: Array<{ id: string; userId: string; exchange: string; symbol: string; orderId: string; positionId: string | null }> = [];

  function matchesWhere(row: (typeof executions)[number], where: any): boolean {
    if (row.userId !== where.userId || row.exchange !== where.exchange) return false;
    if (!where.OR) return true;
    return where.OR.some((cond: any) => {
      if (cond.symbol != null && row.symbol !== cond.symbol) return false;
      if (cond.execTime?.gte != null && row.execTime.getTime() < cond.execTime.gte.getTime()) return false;
      return true;
    });
  }

  const execution = {
    findFirst: jest.fn(async ({ where }: any) => {
      const matches = executions.filter((r) => r.userId === where.userId && r.exchange === where.exchange);
      if (matches.length === 0) return null;
      matches.sort((a, b) => b.execTime.getTime() - a.execTime.getTime());
      return { execTime: matches[0].execTime };
    }),
    createMany: jest.fn(async ({ data, skipDuplicates }: any) => {
      let count = 0;
      for (const row of data) {
        const dup = executions.some(
          (r) =>
            r.userId === row.userId &&
            r.exchange === row.exchange &&
            r.execId === row.execId &&
            r.orderId === row.orderId,
        );
        if (dup && skipDuplicates) continue;
        executions.push({ ...row });
        count++;
      }
      return { count };
    }),
    findMany: jest.fn(async ({ where }: any) => {
      return executions
        .filter((r) => matchesWhere(r, where))
        .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.execTime.getTime() - b.execTime.getTime())
        .map((r) => ({
          symbol: r.symbol,
          side: r.side,
          qty: r.qty,
          closedSize: r.closedSize,
          orderId: r.orderId,
          execTime: r.execTime,
        }));
    }),
  };

  const fundingFee = { createMany: jest.fn(async () => ({ count: 0 })) };

  const trade = {
    findMany: jest.fn(async ({ where }: any) => {
      return trades
        .filter((t) => {
          if (t.userId !== where.userId || t.exchange !== where.exchange) return false;
          if (where.symbol?.in && !where.symbol.in.includes(t.symbol)) return false;
          return true;
        })
        .map((t) => ({ id: t.id, orderId: t.orderId, positionId: t.positionId }));
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const t = trades.find((x) => x.id === where.id);
      if (t) t.positionId = data.positionId;
      return t;
    }),
  };

  return { prisma: { execution, fundingFee, trade } as any, executions, trades };
}

function makeExchanges(fetchFills: jest.Mock) {
  return { get: () => ({ fetchFills }) } as any;
}

function fill(
  symbol: string,
  side: 'Buy' | 'Sell',
  qty: number,
  closedSize: number,
  execTime: Date,
  orderId: string,
) {
  return {
    symbol,
    side,
    qty,
    price: 100,
    closedSize,
    execType: 'Trade',
    orderId,
    execId: orderId,
    execTime,
  };
}

function openPositions(entries: Array<{ symbol: string; direction: 'long' | 'short'; size: string }>): PositionsResult {
  return { success: true, positions: entries.map((e) => ({ ...e })) };
}

const CREDS = { apiKey: 'k', apiSecret: 's' };
const T0 = new Date('2026-09-01T00:00:00Z');
const min = (m: number) => new Date(T0.getTime() + m * 60_000);

describe('PositionBuilderService — T13 инкрементальная перестройка', () => {
  it('тик без новых филлов и без сдвига открытых размеров не делает ни одного findMany по executions', async () => {
    const { prisma } = makeFakePrisma();
    const fetchFills = jest.fn().mockResolvedValue({ success: true, items: [] });
    const service = new PositionBuilderService(prisma, makeExchanges(fetchFills));

    // Первый прогон — холодный кэш, полный обход (executions.findMany вызван).
    await service.sync('u1', 'bybit', CREDS, openPositions([]));
    expect(prisma.execution.findMany).toHaveBeenCalledTimes(1);

    // Второй прогон — те же (нулевые) открытые размеры, новых филлов нет.
    await service.sync('u1', 'bybit', CREDS, openPositions([]));
    expect(prisma.execution.findMany).toHaveBeenCalledTimes(1); // не выросло
    expect(prisma.trade.findMany).not.toHaveBeenCalledTimes(2); // rebuild вообще не звался повторно
  });

  it('открытые размеры сдвинулись без новых филлов — не пропускает перестройку', async () => {
    const { prisma } = makeFakePrisma();
    const fetchFills = jest.fn().mockResolvedValue({ success: true, items: [] });
    const service = new PositionBuilderService(prisma, makeExchanges(fetchFills));

    await service.sync('u1', 'bybit', CREDS, openPositions([]));
    const callsAfterFirst = prisma.execution.findMany.mock.calls.length;

    await service.sync(
      'u1',
      'bybit',
      CREDS,
      openPositions([{ symbol: 'BTCUSDT', direction: 'long', size: '0.5' }]),
    );
    expect(prisma.execution.findMany.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('граница позиции не сдвигается при переходе от полного обхода к скопированному: позиция с частичным закрытием ловит и открывающий, и оба закрывающих филла', async () => {
    const { prisma, trades } = makeFakePrisma();

    // Более ранняя, уже полностью закрытая позиция на том же символе+стороне
    // — нужна, чтобы buildSide не отказался разрешать хвост как
    // «не сошёлся» (см. её же комментарий: null возвращается, когда во всей
    // просмотренной истории не нашлось НИ ОДНОЙ полностью закрытой позиции
    // при наличии частичных закрытий — сигнал плохого сида на границе
    // бэкафилла, не относящийся к этому тесту).
    const priorOpen = fill('BTCUSDT', 'Buy', 1, 0, min(-100), 'prior-open');
    const priorClose = fill('BTCUSDT', 'Sell', 1, 1, min(-90), 'prior-close');
    const openFill = fill('BTCUSDT', 'Buy', 1, 0, min(0), 'open-1');
    const partialClose = fill('BTCUSDT', 'Sell', 0.5, 0.5, min(10), 'close-1');
    const finalClose = fill('BTCUSDT', 'Sell', 0.5, 0.5, min(20), 'close-2');

    // Трейды (закрытые ордера) появляются в системе в тот же момент, что и
    // их филлы — как это делает реальный TradeSyncService.persist().
    trades.push(
      { id: 't-prior', userId: 'u1', exchange: 'bybit', symbol: 'BTCUSDT', orderId: 'prior-close', positionId: null },
      { id: 't1', userId: 'u1', exchange: 'bybit', symbol: 'BTCUSDT', orderId: 'close-1', positionId: null },
    );

    const fetchFills = jest
      .fn()
      // Тик 1: вся предыдущая история + открытие + первое частичное закрытие,
      // позиция ещё открыта на 0.5.
      .mockResolvedValueOnce({
        success: true,
        items: [priorOpen, priorClose, openFill, partialClose],
      })
      // Тик 2: только новый финальный филл — как steady-state синк видит окно с последнего сохранённого.
      .mockResolvedValueOnce({ success: true, items: [finalClose] });

    const service = new PositionBuilderService(prisma, makeExchanges(fetchFills));

    const r1 = await service.sync(
      'u1',
      'bybit',
      CREDS,
      openPositions([{ symbol: 'BTCUSDT', direction: 'long', size: '0.5' }]),
    );
    expect(r1.stamped).toBe(2); // t-prior и t1
    const positionIdAfterTick1 = trades.find((t) => t.id === 't1')!.positionId;
    expect(positionIdAfterTick1).toBe(`BTCUSDT:long:${openFill.execTime.getTime()}`);
    expect(trades.find((t) => t.id === 't-prior')!.positionId).toBe(
      `BTCUSDT:long:${priorOpen.execTime.getTime()}`,
    );

    // Второй трейд (финальное закрытие) появляется вместе со своим филлом.
    trades.push({ id: 't2', userId: 'u1', exchange: 'bybit', symbol: 'BTCUSDT', orderId: 'close-2', positionId: null });

    const findManyCallsBeforeTick2 = prisma.execution.findMany.mock.calls.length;
    const r2 = await service.sync('u1', 'bybit', CREDS, openPositions([])); // позиция теперь полностью закрыта
    expect(prisma.execution.findMany.mock.calls.length).toBe(findManyCallsBeforeTick2 + 1);

    // Критично: id позиции у ОБОИХ трейдов текущей позиции — от времени
    // ОТКРЫВАЮЩЕГО её филла (open-1), а не от финального закрытия и не от
    // более ранней позиции. Если бы scoped-чтение не заглянуло за
    // кэшированное начало хвоста (используя вместо этого только время
    // нового филла close-2), сид размера был бы посчитан неверно и id
    // пересчитался бы от close-2, расходясь с id, который уже стоит у t1.
    expect(trades.find((t) => t.id === 't1')!.positionId).toBe(positionIdAfterTick1);
    expect(trades.find((t) => t.id === 't2')!.positionId).toBe(positionIdAfterTick1);
    expect(r2.stamped).toBe(1); // только t2 реально поменялся
  });

  it('перестройка не трогает трейды символа, которого не коснулись ни новые филлы, ни сдвиг размера', async () => {
    const { prisma, trades } = makeFakePrisma();

    const btcOpen = fill('BTCUSDT', 'Buy', 1, 0, min(0), 'btc-open');
    const btcClose = fill('BTCUSDT', 'Sell', 1, 1, min(5), 'btc-close');
    const ethOpen = fill('ETHUSDT', 'Buy', 2, 0, min(0), 'eth-open');
    const ethClose = fill('ETHUSDT', 'Sell', 2, 2, min(5), 'eth-close');

    trades.push(
      { id: 't-btc', userId: 'u1', exchange: 'bybit', symbol: 'BTCUSDT', orderId: 'btc-close', positionId: null },
      { id: 't-eth', userId: 'u1', exchange: 'bybit', symbol: 'ETHUSDT', orderId: 'eth-close', positionId: null },
    );

    const fetchFills = jest
      .fn()
      .mockResolvedValueOnce({ success: true, items: [btcOpen, btcClose, ethOpen, ethClose] })
      .mockResolvedValueOnce({ success: true, items: [] }); // тик 2: новых филлов нет вовсе

    const service = new PositionBuilderService(prisma, makeExchanges(fetchFills));

    await service.sync('u1', 'bybit', CREDS, openPositions([]));
    expect(trades.find((t) => t.id === 't-btc')?.positionId).not.toBeNull();
    expect(trades.find((t) => t.id === 't-eth')?.positionId).not.toBeNull();

    // Тик 2: только у BTC меняется открытый размер (переоткрылась заново на
    // рынке, но фактически новых сохранённых филлов ещё нет — синк ещё не
    // подтянул их из fetchFills, поэтому trades для этой новой позиции нет).
    const beforeUpdateCalls = prisma.trade.update.mock.calls.length;
    await service.sync(
      'u1',
      'bybit',
      CREDS,
      openPositions([{ symbol: 'BTCUSDT', direction: 'long', size: '0.3' }]),
    );
    // ETHUSDT не входил в область (ни новых филлов, ни сдвига его размера) —
    // updateMany/update по его трейду не должен был случиться повторно.
    const ethUpdated = prisma.trade.update.mock.calls
      .slice(beforeUpdateCalls)
      .some((call: any) => call[0].where.id === 't-eth');
    expect(ethUpdated).toBe(false);
  });

  it('хэдж-режим: лонг и шорт одного символа группируются раздельно', async () => {
    const { prisma, trades } = makeFakePrisma();

    const longOpen = fill('BTCUSDT', 'Buy', 1, 0, min(0), 'l-open');
    const longClose = fill('BTCUSDT', 'Sell', 1, 1, min(5), 'l-close');
    const shortOpen = fill('BTCUSDT', 'Sell', 1, 0, min(1), 's-open');
    const shortClose = fill('BTCUSDT', 'Buy', 1, 1, min(6), 's-close');

    trades.push(
      { id: 't-long', userId: 'u1', exchange: 'bybit', symbol: 'BTCUSDT', orderId: 'l-close', positionId: null },
      { id: 't-short', userId: 'u1', exchange: 'bybit', symbol: 'BTCUSDT', orderId: 's-close', positionId: null },
    );

    const fetchFills = jest
      .fn()
      .mockResolvedValueOnce({ success: true, items: [longOpen, longClose, shortOpen, shortClose] });

    const service = new PositionBuilderService(prisma, makeExchanges(fetchFills));
    const r = await service.sync('u1', 'bybit', CREDS, openPositions([]));

    expect(r.positions).toBe(2);
    expect(trades[0].positionId).toBe(`BTCUSDT:long:${longOpen.execTime.getTime()}`);
    expect(trades[1].positionId).toBe(`BTCUSDT:short:${shortOpen.execTime.getTime()}`);
    expect(trades[0].positionId).not.toBe(trades[1].positionId);
  });

  it('full-опция игнорирует кэш и всегда идёт полным обходом', async () => {
    const { prisma } = makeFakePrisma();
    const fetchFills = jest.fn().mockResolvedValue({ success: true, items: [] });
    const service = new PositionBuilderService(prisma, makeExchanges(fetchFills));

    await service.sync('u1', 'bybit', CREDS, openPositions([]));
    const callsAfterFirst = prisma.execution.findMany.mock.calls.length;

    await service.sync('u1', 'bybit', CREDS, openPositions([]), { full: true });
    expect(prisma.execution.findMany.mock.calls.length).toBe(callsAfterFirst + 1);
  });
});
