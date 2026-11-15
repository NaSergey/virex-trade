import {
  addEvent,
  binanceLiqUrl,
  mergeBack,
  minuteOf,
  parseBinance,
  parseBybit,
  type LiqBucket,
  type LiqEvent,
} from './liquidation-feed';
import { LiquidationSocket, type SocketLike } from './liquidation-socket';

// Живые сообщения, снятые с потоков 2026-11-15.
const BYBIT_MSG =
  '{"topic":"allLiquidation.DNAUSDT","type":"snapshot","ts":1794759346251,"data":[{"T":1794759345991,"s":"DNAUSDT","S":"Buy","v":"3732","p":"0.1585"},{"T":1794759346016,"s":"DNAUSDT","S":"Sell","v":"10341","p":"0.1582"}]}';
const BINANCE_MSG =
  '{"stream":"!forceOrder@arr","data":{"e":"forceOrder","E":1794759242070,"o":{"s":"FFUSDT","S":"BUY","o":"LIMIT","f":"IOC","q":"7673","p":"0.1023600","ap":"0.0999770","X":"FILLED","l":"4460","z":"7673","T":1794759241066,"ps":"FFUSDT","st":1}}}';

describe('parseBybit', () => {
  it('Buy — ликвидирован лонг, Sell — шорт', () => {
    expect(parseBybit(BYBIT_MSG)).toEqual([
      {
        exchange: 'bybit',
        symbol: 'DNAUSDT',
        side: 'long',
        qty: 3732,
        price: 0.1585,
        time: 1794759345991,
      },
      {
        exchange: 'bybit',
        symbol: 'DNAUSDT',
        side: 'short',
        qty: 10341,
        price: 0.1582,
        time: 1794759346016,
      },
    ]);
  });

  it('служебные ответы и мусор — пусто', () => {
    expect(parseBybit('{"success":true,"ret_msg":"pong","op":"ping"}')).toEqual(
      [],
    );
    expect(parseBybit('not json')).toEqual([]);
    expect(
      parseBybit(
        '{"topic":"allLiquidation.X","data":[{"T":1,"s":"X","S":"Buy","v":"0","p":"1"}]}',
      ),
    ).toEqual([]);
  });
});

describe('parseBinance', () => {
  it('BUY ордера ликвидации — ликвидирован шорт; объём z, цена ap', () => {
    expect(parseBinance(BINANCE_MSG)).toEqual([
      {
        exchange: 'binance',
        symbol: 'FFUSDT',
        side: 'short',
        qty: 7673,
        price: 0.099977,
        time: 1794759241066,
      },
    ]);
  });

  it('SELL — ликвидирован лонг; без обёртки потока тоже читается', () => {
    const raw = JSON.parse(BINANCE_MSG).data;
    raw.o.S = 'SELL';
    expect(parseBinance(JSON.stringify(raw))[0].side).toBe('long');
  });

  it('не forceOrder — пусто', () => {
    expect(parseBinance('{"e":"aggTrade"}')).toEqual([]);
  });

  it('адрес — маршрут /market', () => {
    expect(binanceLiqUrl(['BTCUSDT', 'ETHUSDT'])).toBe(
      'wss://fstream.binance.com/market/stream?streams=btcusdt@forceOrder/ethusdt@forceOrder',
    );
  });
});

describe('сводка по минутам', () => {
  const ev = (over: Partial<LiqEvent>): LiqEvent => ({
    exchange: 'bybit',
    symbol: 'BTCUSDT',
    side: 'long',
    qty: 1,
    price: 100,
    time: Date.UTC(2026, 10, 15, 12, 0, 30),
    ...over,
  });

  it('складывает минуту, держит крупнейшую, разводит стороны и минуты', () => {
    const m = new Map<string, LiqBucket>();
    addEvent(m, ev({ qty: 1 }));
    addEvent(m, ev({ qty: 3, time: Date.UTC(2026, 10, 15, 12, 0, 59, 999) }));
    addEvent(m, ev({ side: 'short' }));
    addEvent(m, ev({ time: Date.UTC(2026, 10, 15, 12, 1) }));
    const rows = [...m.values()];
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      exchange: 'bybit',
      symbol: 'BTCUSDT',
      side: 'long',
      minute: Date.UTC(2026, 10, 15, 12),
      count: 2,
      qty: 4,
      usd: 400,
      maxUsd: 300,
    });
  });

  it('несписанная пачка возвращается сложением с новым', () => {
    const m = new Map<string, LiqBucket>();
    addEvent(m, ev({ qty: 1 }));
    const batch = [...m.values()].map((b) => ({ ...b }));
    m.clear();
    addEvent(m, ev({ qty: 2 }));
    mergeBack(m, batch);
    const [row] = [...m.values()];
    expect(row).toMatchObject({ count: 2, qty: 3, usd: 300, maxUsd: 200 });
  });

  it('minuteOf обрезает до минуты', () => {
    expect(minuteOf(Date.UTC(2026, 0, 1, 0, 0, 59, 999))).toBe(
      Date.UTC(2026, 0, 1),
    );
  });
});

describe('LiquidationSocket', () => {
  class FakeWs implements SocketLike {
    handlers: Record<string, (...a: any[]) => void> = {};
    sent: string[] = [];
    closed = false;
    on(event: string, cb: (...a: any[]) => void) {
      this.handlers[event] = cb;
    }
    send(d: string) {
      this.sent.push(d);
    }
    close() {
      this.closed = true;
    }
    emit(event: string, ...a: any[]) {
      this.handlers[event]?.(...a);
    }
  }

  let now = 0;
  beforeEach(() => {
    jest.useFakeTimers();
    now = 0;
  });
  afterEach(() => jest.useRealTimers());

  const make = (
    spec: Partial<ConstructorParameters<typeof LiquidationSocket>[0]> = {},
  ) => {
    const ws = new FakeWs();
    const h = {
      onOpen: jest.fn(),
      onEvents: jest.fn(),
      onWarn: jest.fn(),
      onClosed: jest.fn(),
    };
    const s = new LiquidationSocket(
      {
        exchange: 'bybit',
        url: 'x',
        hello: ['sub'],
        silenceMs: 45_000,
        parse: parseBybit,
        ...spec,
      },
      h,
      () => ws,
      () => now,
    );
    return { ws, h, s };
  };
  const advance = (ms: number) => {
    now += ms;
    jest.advanceTimersByTime(ms);
  };

  it('подписка на открытии, события — наружу, отказ подписки — в лог', () => {
    const { ws, h } = make();
    ws.emit('open');
    expect(ws.sent).toEqual(['sub']);
    expect(h.onOpen).toHaveBeenCalled();
    ws.emit('message', Buffer.from(BYBIT_MSG));
    expect(h.onEvents.mock.calls[0][0]).toHaveLength(2);
    ws.emit(
      'message',
      '{"success":false,"ret_msg":"bad topic","op":"subscribe"}',
    );
    expect(h.onWarn).toHaveBeenCalled();
  });

  it('пингует по расписанию и закрывается после тишины, сообщая один раз', () => {
    const { ws, h } = make({ ping: { message: 'ping', everyMs: 20_000 } });
    ws.emit('open');
    advance(20_000);
    expect(ws.sent).toContain('ping');
    advance(25_000);
    expect(h.onClosed).toHaveBeenCalledTimes(1);
    expect(ws.closed).toBe(true);
    ws.emit('close');
    expect(h.onClosed).toHaveBeenCalledTimes(1);
  });

  it('пинг-фрейм сервера держит соединение живым', () => {
    const { ws, h } = make({ silenceMs: 60_000 });
    ws.emit('open');
    advance(50_000);
    ws.emit('ping');
    advance(50_000);
    expect(h.onClosed).not.toHaveBeenCalled();
  });

  it('не открылось за 15 с — конец', () => {
    const { h } = make();
    advance(15_000);
    expect(h.onClosed).toHaveBeenCalledTimes(1);
  });

  it('закрытое своей волей молчит', () => {
    const { ws, h, s } = make();
    ws.emit('open');
    s.close();
    ws.emit('close');
    expect(h.onClosed).not.toHaveBeenCalled();
  });
});
