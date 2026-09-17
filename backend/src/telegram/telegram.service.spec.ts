import { TelegramService } from './telegram.service';
import { packId } from './ids';

/**
 * T10 Critical fix (ревью): `ct|`-кнопка (тег закрытой сделки) пишет
 * `TradeTag` в обход `TagsService.setTradeTags` — единственный живой путь
 * записи в эту таблицу, который сам не бампал версию данных пользователя.
 * Кнопка реально достижима через getUpdates-поллинг под уже отправленными
 * сообщениями бота (см. комментарий в `telegram.service.ts` у `handleCallback`).
 */

const TRADE_ID = '11111111-1111-1111-1111-111111111111';
const TAG_ID = '22222222-2222-2222-2222-222222222222';

function fakeFetchOk() {
  return jest.fn().mockResolvedValue({
    status: 200,
    json: async () => ({ ok: true, result: {} }),
  });
}

function makeService(existingTradeTag: unknown = null) {
  const user = { id: 'u1', telegramChatId: 'c1' };
  const trade = { id: TRADE_ID, userId: 'u1' };
  const tag = { id: TAG_ID, userId: 'u1', name: 'Пробой', color: '#fff' };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    trade: { findFirst: jest.fn().mockResolvedValue(trade) },
    tag: { findFirst: jest.fn().mockResolvedValue(tag) },
    tradeTag: {
      findUnique: jest.fn().mockResolvedValue(existingTradeTag),
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const dataVersion = { get: jest.fn(), bump: jest.fn().mockResolvedValue(undefined) };
  const service = new TelegramService(prisma as any, {} as any, dataVersion as any);
  return { service, prisma, dataVersion, trade, tag };
}

function ctCallback(tradeId: string, tagId: string) {
  return {
    id: 'cbq1',
    message: { chat: { id: 'c1' }, message_id: 42 },
    data: `ct|${packId(tradeId)}|${packId(tagId)}`,
  };
}

describe('TelegramService — ct| (тег закрытой сделки) бампит версию данных (T10)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('создаёт TradeTag и бампит версию ровно один раз', async () => {
    global.fetch = fakeFetchOk() as unknown as typeof fetch;
    const { service, prisma, dataVersion } = makeService(null);

    await (service as any).handleCallback(ctCallback(TRADE_ID, TAG_ID));

    expect(prisma.tradeTag.create).toHaveBeenCalledTimes(1);
    expect(prisma.tradeTag.delete).not.toHaveBeenCalled();
    expect(dataVersion.bump).toHaveBeenCalledTimes(1);
    expect(dataVersion.bump).toHaveBeenCalledWith('u1');
  });

  it('снимает существующий TradeTag и тоже бампит версию', async () => {
    global.fetch = fakeFetchOk() as unknown as typeof fetch;
    const { service, prisma, dataVersion } = makeService({ tradeId: TRADE_ID, tagId: TAG_ID });

    await (service as any).handleCallback(ctCallback(TRADE_ID, TAG_ID));

    expect(prisma.tradeTag.delete).toHaveBeenCalledTimes(1);
    expect(prisma.tradeTag.create).not.toHaveBeenCalled();
    expect(dataVersion.bump).toHaveBeenCalledTimes(1);
    expect(dataVersion.bump).toHaveBeenCalledWith('u1');
  });

  it('сделка или тег не найдены — версия не бампится (TradeTag не менялся)', async () => {
    global.fetch = fakeFetchOk() as unknown as typeof fetch;
    const { service, prisma, dataVersion } = makeService(null);
    prisma.trade.findFirst.mockResolvedValueOnce(null);

    await (service as any).handleCallback(ctCallback(TRADE_ID, TAG_ID));

    expect(prisma.tradeTag.create).not.toHaveBeenCalled();
    expect(prisma.tradeTag.delete).not.toHaveBeenCalled();
    expect(dataVersion.bump).not.toHaveBeenCalled();
  });
});
