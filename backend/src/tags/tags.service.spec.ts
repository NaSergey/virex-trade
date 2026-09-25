import { BattlePassService } from '../battlepass/battlepass.service';
import { TagsService } from './tags.service';

const NOW = new Date('2026-09-21T10:00:00Z');
const SEASON = '2026-Q3';

/**
 * Общая транзакция на оба сервиса: `linkTagsToNewTrades` пишет TradeTag и тем
 * же tx зовёт `BattlePassService.awardMany` — событие и прогресс обязаны
 * попасть в ту же поддельную базу, что проверяет тест, а не в свою.
 */
function fakeDb() {
  const tradeTags: { tradeId: string; tagId: string }[] = [];
  const events: { userId: string; season: string; source: string; refId: string; xp: number }[] = [];
  const progress = new Map<string, { xp: number }>();
  const key = (userId: string) => `${userId}:${SEASON}`;

  const tx = {
    tradeTag: {
      createMany: jest.fn(async ({ data }: any) => {
        const rows = Array.isArray(data) ? data : [data];
        let count = 0;
        for (const row of rows) {
          if (tradeTags.some((t) => t.tradeId === row.tradeId && t.tagId === row.tagId)) continue;
          tradeTags.push(row);
          count += 1;
        }
        return { count };
      }),
    },
    battlePassXpEvent: {
      createMany: jest.fn(async ({ data }: any) => {
        const rows = Array.isArray(data) ? data : [data];
        let count = 0;
        for (const row of rows) {
          if (events.some((e) => e.userId === row.userId && e.source === row.source && e.refId === row.refId)) continue;
          events.push(row);
          count += 1;
        }
        return { count };
      }),
    },
    battlePassProgress: {
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const k = key(where.userId_season.userId);
        const row = progress.get(k);
        if (!row) {
          progress.set(k, { xp: create.xp });
          return create;
        }
        row.xp += update.xp?.increment ?? 0;
        return row;
      }),
    },
  };

  return { tx, tradeTags, events, progress, key };
}

/** `positionTag`/`trade` отдаются готовыми списками — реальные join/фильтр внутри метода остаются настоящим кодом. */
function service(db: ReturnType<typeof fakeDb>, data: { positionTags: any[]; trades: any[] }) {
  const prisma = {
    positionTag: { findMany: jest.fn(async () => data.positionTags) },
    trade: { findMany: jest.fn(async () => data.trades) },
    $transaction: jest.fn(async (fn: any) => fn(db.tx)),
  };
  const battlePass = new BattlePassService(prisma as never, {} as never);
  return new TagsService(prisma as never, {} as never, battlePass);
}

describe('TagsService.linkTagsToNewTrades', () => {
  it('новая сделка под тегом открытой позиции получает XP', async () => {
    const db = fakeDb();
    const svc = service(db, {
      positionTags: [{ symbol: 'BTCUSDT', direction: 'long', tagId: 'tag1', createdAt: NOW }],
      trades: [{ id: 'trade1', closedAt: NOW }],
    });

    await svc.linkTagsToNewTrades('u1', NOW);

    expect(db.events).toEqual([
      expect.objectContaining({ userId: 'u1', source: 'journal.tag', refId: 'trade1', xp: 15 }),
    ]);
    expect(db.progress.get(db.key('u1'))?.xp).toBe(15);
  });

  it('повторный прогон той же сделки не начисляет второй раз', async () => {
    const db = fakeDb();
    const svc = service(db, {
      positionTags: [{ symbol: 'BTCUSDT', direction: 'long', tagId: 'tag1', createdAt: NOW }],
      trades: [{ id: 'trade1', closedAt: NOW }],
    });

    await svc.linkTagsToNewTrades('u1', NOW);
    await svc.linkTagsToNewTrades('u1', NOW);

    expect(db.events).toHaveLength(1);
    expect(db.progress.get(db.key('u1'))?.xp).toBe(15);
  });

  it('несколько сделок под одним тегом дают XP за каждую', async () => {
    const db = fakeDb();
    const svc = service(db, {
      positionTags: [{ symbol: 'BTCUSDT', direction: 'long', tagId: 'tag1', createdAt: NOW }],
      trades: [
        { id: 'trade1', closedAt: NOW },
        { id: 'trade2', closedAt: NOW },
      ],
    });

    await svc.linkTagsToNewTrades('u1', NOW);

    expect(db.events).toHaveLength(2);
    expect(db.progress.get(db.key('u1'))?.xp).toBe(30);
  });

  it('без тегов на открытых позициях XP не начисляется', async () => {
    const db = fakeDb();
    const svc = service(db, { positionTags: [], trades: [] });

    await svc.linkTagsToNewTrades('u1', NOW);

    expect(db.events).toHaveLength(0);
  });
});
