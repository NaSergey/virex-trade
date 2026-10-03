import type { SocketHandlers } from './bybit-private-socket';
import { keyHash } from './stream-state';
import { TerminalStreamService } from './terminal-stream.service';

const NOW = 1_700_000_000_000;
const CREDS = { apiKey: 'k1', apiSecret: 's1' };

const account = (walletBalance: string) => ({ accountType: 'UNIFIED', coin: [{ coin: 'USDT', walletBalance }] });
const pos = (size: string, updatedTime: string) => ({
  symbol: 'BTCUSDT',
  side: 'Buy',
  size,
  avgPrice: '60000',
  positionIdx: 0,
  updatedTime,
});

/** Сокеты, открытые менеджером: обработчики и закрытие. */
interface Opened {
  creds: { apiKey: string };
  h: SocketHandlers;
  closed: boolean;
  /** Сколько мс сокет не слышал биржу. */
  idle: number;
}

function setup(o: { wanted?: string[]; creds?: typeof CREDS | null; active?: string; listener?: unknown } = {}) {
  let wanted = o.wanted ?? ['u1'];
  let creds: typeof CREDS | null = o.creds === undefined ? CREDS : o.creds;
  const opened: Opened[] = [];
  const store = {
    wanted: jest.fn(async () => wanted),
    save: jest.fn(async () => undefined),
    heartbeat: jest.fn(async () => undefined),
    drop: jest.fn(async (_userId: string) => undefined),
  };
  const credentials = {
    activeExchange: jest.fn(async (_userId: string) => o.active ?? 'bybit'),
    get: jest.fn(async () => creds),
  };
  let snapshot: { account: unknown; positions: unknown[] } = { account: account('1000'), positions: [] };
  let failSnapshot = false;
  const bybit = {
    privateGet: jest.fn(async (_c: unknown, path: string) => {
      if (failSnapshot) throw new Error('busy');
      if (path === '/account/wallet-balance') return { list: [snapshot.account] };
      if (path === '/position/list') return { list: snapshot.positions };
      return { list: [] };
    }),
  };
  const open = (c: { apiKey: string }, h: SocketHandlers) => {
    const s: Opened = { creds: c, h, closed: false, idle: 0 };
    opened.push(s);
    return { close: () => (s.closed = true), idleMs: () => s.idle };
  };
  const service = new TerminalStreamService(store as any, credentials as any, bybit as any, open, o.listener as any);
  return {
    service,
    store,
    credentials,
    bybit,
    opened,
    setWanted: (w: string[]) => (wanted = w),
    setCreds: (c: typeof CREDS | null) => (creds = c),
    setSnapshot: (s: typeof snapshot) => (snapshot = s),
    failSnapshot: (v: boolean) => (failSnapshot = v),
  };
}

/** Дать отработать промисам снимка. */
const settle = () => jest.advanceTimersByTimeAsync(0);

describe('TerminalStreamService', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  it('открывает соединение тому, кто смотрит терминал, и после подписки пишет снимок с отпечатком ключа', async () => {
    const t = setup();
    await t.service.tick();
    expect(t.opened).toHaveLength(1);
    expect(t.store.save).not.toHaveBeenCalled();

    t.opened[0].h.onReady();
    await settle();
    expect(t.bybit.privateGet).toHaveBeenCalledTimes(3);
    expect(t.store.save).toHaveBeenCalledWith('u1', {
      keyHash: keyHash('k1'),
      state: expect.objectContaining({ wallet: expect.objectContaining({ walletBalance: 1000 }) }),
      eventAt: expect.any(Date),
    });
  });

  it('события до снимка не теряются, а старые не откатывают снимок', async () => {
    const t = setup();
    t.setSnapshot({ account: account('1000'), positions: [pos('0.2', '3000')] });
    await t.service.tick();
    const { h } = t.opened[0];
    // События идут только после подписки: подписка — снимок начат — события во время снимка.
    h.onReady();
    h.onTopic({ topic: 'position.linear', data: [pos('0.1', '2000')] }); // старше снимка
    h.onTopic({ topic: 'wallet', data: [account('1200')] }); // пришло после начала снимка
    await settle();
    const state = (t.store.save.mock.calls.at(-1) as any)[1].state;
    expect(state.positions['BTCUSDT:0'].size).toBe('0.2');
    expect(state.wallet.walletBalance).toBe(1200);
  });

  it('события после снимка уходят в базу пачкой, не чаще раза в 150 мс', async () => {
    const t = setup();
    await t.service.tick();
    t.opened[0].h.onReady();
    await settle();
    t.store.save.mockClear();

    t.opened[0].h.onTopic({ topic: 'position.linear', data: [pos('0.1', '5000')] });
    t.opened[0].h.onTopic({ topic: 'position.linear', data: [pos('0.3', '5100')] });
    expect(t.store.save).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(150);
    expect(t.store.save).toHaveBeenCalledTimes(1);
    expect((t.store.save.mock.calls[0] as any)[1].state.positions['BTCUSDT:0'].size).toBe('0.3');
  });

  it('ушедший со страницы теряет соединение', async () => {
    const t = setup();
    await t.service.tick();
    t.setWanted([]);
    await t.service.tick();
    expect(t.opened[0].closed).toBe(true);
    expect(t.store.drop).toHaveBeenCalledWith('u1');
  });

  it('смена ключа пересоздаёт соединение, потеря ключа или не-Bybit — закрывает', async () => {
    const t = setup();
    await t.service.tick();
    t.setCreds({ apiKey: 'k2', apiSecret: 's2' });
    await t.service.tick();
    expect(t.opened[0].closed).toBe(true);
    expect(t.opened[1].creds.apiKey).toBe('k2');

    t.setCreds(null);
    await t.service.tick();
    expect(t.opened[1].closed).toBe(true);
    expect(t.opened).toHaveLength(2);
  });

  it('обрыв — пауза 1 с, потом 2 с; отказ входа — 5 минут', async () => {
    const t = setup();
    await t.service.tick();
    t.opened[0].h.onClosed('closed');
    await settle(); // сброс строки идёт очередью записей
    expect(t.store.drop).toHaveBeenCalledWith('u1');
    await t.service.tick();
    expect(t.opened).toHaveLength(1); // пауза
    await jest.advanceTimersByTimeAsync(1_000);
    await t.service.tick();
    expect(t.opened).toHaveLength(2);

    t.opened[1].h.onClosed('closed');
    await jest.advanceTimersByTimeAsync(1_000);
    await t.service.tick();
    expect(t.opened).toHaveLength(2); // вторая пауза — 2 с
    await jest.advanceTimersByTimeAsync(1_000);
    await t.service.tick();
    expect(t.opened).toHaveLength(3);

    t.opened[2].h.onClosed('auth');
    await jest.advanceTimersByTimeAsync(4 * 60_000);
    await t.service.tick();
    expect(t.opened).toHaveLength(3);
    await jest.advanceTimersByTimeAsync(60_000);
    await t.service.tick();
    expect(t.opened).toHaveLength(4);
  });

  it('снимок не прочитался — соединение закрывается и ждёт паузу', async () => {
    const t = setup();
    t.failSnapshot(true);
    await t.service.tick();
    t.opened[0].h.onReady();
    await settle();
    expect(t.opened[0].closed).toBe(true);
    expect(t.store.save).not.toHaveBeenCalled();
    t.failSnapshot(false);
    await jest.advanceTimersByTimeAsync(1_000);
    await t.service.tick();
    expect(t.opened).toHaveLength(2);
  });

  it('не больше 450 новых соединений за 5 минут', async () => {
    const t = setup({ wanted: Array.from({ length: 500 }, (_, i) => `u${i}`) });
    await t.service.tick();
    expect(t.opened).toHaveLength(450);
    await jest.advanceTimersByTimeAsync(5 * 60_000);
    await t.service.tick();
    expect(t.opened).toHaveLength(500);
  });

  it('пульс отмечает только живые соединения', async () => {
    const t = setup({ wanted: ['u1', 'u2'] });
    await t.service.tick();
    t.opened[0].h.onReady();
    await settle();
    await t.service.beat();
    expect(t.store.heartbeat).toHaveBeenCalledWith(['u1']);
  });

  it('раз в ~10 минут состояние перечитывается снимком', async () => {
    const t = setup();
    await t.service.tick();
    t.opened[0].h.onReady();
    await settle();
    t.bybit.privateGet.mockClear();
    await jest.advanceTimersByTimeAsync(13 * 60_000);
    await t.service.tick();
    await settle();
    expect(t.bybit.privateGet).toHaveBeenCalledTimes(3);
    expect(t.opened).toHaveLength(1); // соединение то же
  });

  it('один сломанный пользователь не оставляет без соединения остальных', async () => {
    const t = setup({ wanted: ['u1', 'u2'] });
    t.credentials.activeExchange.mockImplementation(async (userId: string) => {
      if (userId === 'u1') throw new Error('ключ не расшифровался');
      return 'bybit';
    });
    await t.service.tick();
    expect(t.opened).toHaveLength(1);
  });

  it('повторный снимок не прочитался — соединение и состояние остаются, снимок повторится', async () => {
    const t = setup();
    await t.service.tick();
    t.opened[0].h.onReady();
    await settle();
    t.store.save.mockClear();

    t.failSnapshot(true);
    await jest.advanceTimersByTimeAsync(13 * 60_000);
    await t.service.tick();
    await settle();
    expect(t.opened[0].closed).toBe(false);
    expect(t.store.drop).not.toHaveBeenCalled();

    // события живого соединения по-прежнему доходят до базы
    t.opened[0].h.onTopic({ topic: 'position.linear', data: [pos('0.1', '9000')] });
    await jest.advanceTimersByTimeAsync(150);
    expect(t.store.save).toHaveBeenCalledTimes(1);

    t.failSnapshot(false);
    t.bybit.privateGet.mockClear();
    await jest.advanceTimersByTimeAsync(60_000);
    await t.service.tick();
    await settle();
    expect(t.bybit.privateGet).toHaveBeenCalledTimes(3);
  });

  it('не записанное состояние пульсом не прикрывается: вместо пульса — повтор записи', async () => {
    const t = setup();
    t.store.save.mockRejectedValueOnce(new Error('db'));
    await t.service.tick();
    t.opened[0].h.onReady();
    await settle();
    expect(t.store.save).toHaveBeenCalledTimes(1);

    await t.service.beat();
    await settle();
    expect(t.store.heartbeat).not.toHaveBeenCalled();
    expect(t.store.save).toHaveBeenCalledTimes(2);

    await t.service.beat();
    expect(t.store.heartbeat).toHaveBeenCalledWith(['u1']);
  });

  it('замолчавшее соединение пульса не получает', async () => {
    const t = setup();
    await t.service.tick();
    t.opened[0].h.onReady();
    await settle();
    t.opened[0].idle = 36_000;
    await t.service.beat();
    expect(t.store.heartbeat).not.toHaveBeenCalled();
  });

  it('сброс строки не обгоняет начатую запись', async () => {
    const t = setup();
    let release!: () => void;
    t.store.save.mockImplementationOnce(() => new Promise<undefined>((r) => (release = () => r(undefined))));
    await t.service.tick();
    t.opened[0].h.onReady();
    await settle(); // запись начата и висит

    t.opened[0].h.onClosed('closed');
    await settle();
    expect(t.store.drop).not.toHaveBeenCalled();

    release();
    await settle();
    expect(t.store.drop).toHaveBeenCalledWith('u1');
  });

  it('остановка процесса закрывает соединения и сбрасывает строки — экран уходит на REST сразу', async () => {
    const t = setup({ wanted: ['u1', 'u2'] });
    await t.service.tick();
    await t.service.onModuleDestroy();
    expect(t.opened.every((o) => o.closed)).toBe(true);
    expect(t.store.drop.mock.calls.map(([id]) => id).sort()).toEqual(['u1', 'u2']);
  });

  it('сброс прежнего потока не затирает первую запись нового после смены ключа', async () => {
    const t = setup();
    let release!: () => void;
    t.store.drop.mockImplementationOnce(() => new Promise<undefined>((r) => (release = () => r(undefined))));
    await t.service.tick();
    t.setCreds({ apiKey: 'k2', apiSecret: 's2' });
    await t.service.tick(); // старый закрыт, его сброс висит
    t.opened[1].h.onReady();
    await settle();
    expect(t.store.save).not.toHaveBeenCalled(); // запись нового ждёт сброса старого

    release();
    await settle();
    expect(t.store.save).toHaveBeenCalledWith('u1', expect.objectContaining({ keyHash: keyHash('k2') }));
  });

  it('план стопа держит соединение без открытого экрана и получает события', async () => {
    const listener = {
      pinned: jest.fn(async () => ['u9']),
      onEvent: jest.fn(),
      onSnapshot: jest.fn(),
      onIdle: jest.fn(),
    };
    const t = setup({ wanted: [], listener });
    await t.service.tick();
    expect(t.opened).toHaveLength(1);

    t.opened[0].h.onReady();
    await settle();
    expect(listener.onSnapshot).toHaveBeenCalledWith('u9', expect.anything());
    const ctx = listener.onSnapshot.mock.calls[0][1] as { state(): any };
    expect(ctx.state().wallet.walletBalance).toBe(1000);

    t.opened[0].h.onTopic({ topic: 'position.linear', data: [pos('0.1', '9000')] });
    expect(listener.onEvent).toHaveBeenCalledWith('u9', { topic: 'position.linear', data: [pos('0.1', '9000')] }, expect.anything());

    await t.service.tick();
    expect(listener.onIdle).toHaveBeenCalledWith('u9', expect.anything());
  });

  it('упавший список планов не роняет тик', async () => {
    const listener = {
      pinned: jest.fn(async () => {
        throw new Error('db');
      }),
      onEvent: jest.fn(),
      onSnapshot: jest.fn(),
      onIdle: jest.fn(),
    };
    const t = setup({ wanted: ['u1'], listener });
    await t.service.tick();
    expect(t.opened).toHaveLength(1);
  });

  it('упавший слушатель не роняет поток', async () => {
    const listener = {
      pinned: jest.fn(async () => []),
      onEvent: jest.fn(() => {
        throw new Error('boom');
      }),
      onSnapshot: jest.fn(),
      onIdle: jest.fn(),
    };
    const t = setup({ listener });
    await t.service.tick();
    t.opened[0].h.onReady();
    await settle();
    t.store.save.mockClear();
    t.opened[0].h.onTopic({ topic: 'position.linear', data: [pos('0.2', '9000')] });
    await jest.advanceTimersByTimeAsync(150);
    expect(t.store.save).toHaveBeenCalledTimes(1);
  });
});

