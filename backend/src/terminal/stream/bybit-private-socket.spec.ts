import { createHmac } from 'crypto';
import { BybitPrivateSocket, BYBIT_PRIVATE_WS, type SocketHandlers } from './bybit-private-socket';

/** Сокет-заглушка: держит обработчики и отправленное. */
class FakeSocket {
  sent: any[] = [];
  closed = false;
  private handlers = new Map<string, (...args: any[]) => void>();
  constructor(readonly url: string) {}
  on(event: string, cb: (...args: any[]) => void) {
    this.handlers.set(event, cb);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
  }
  emit(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.(...args);
  }
  reply(msg: unknown) {
    this.emit('message', Buffer.from(JSON.stringify(msg)));
  }
}

const NOW = 1_700_000_000_000;

function setup() {
  let fake!: FakeSocket;
  const handlers: jest.Mocked<SocketHandlers> = { onReady: jest.fn(), onTopic: jest.fn(), onClosed: jest.fn() };
  const socket = new BybitPrivateSocket(
    { apiKey: 'key', apiSecret: 'secret' },
    handlers,
    (url) => (fake = new FakeSocket(url)),
    () => Date.now(), // часы Jest: идут вместе с таймерами
  );
  return { socket, handlers, fake: () => fake };
}

describe('BybitPrivateSocket', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  it('входит подписью по «GET/realtime» + expires и подписывается на три темы', () => {
    const { handlers, fake } = setup();
    expect(fake().url).toBe(BYBIT_PRIVATE_WS);

    fake().emit('open');
    const [auth] = fake().sent;
    const expires = auth.args[1];
    expect(auth).toEqual({
      op: 'auth',
      args: ['key', expires, createHmac('sha256', 'secret').update(`GET/realtime${expires}`).digest('hex')],
    });
    expect(expires).toBeGreaterThan(NOW);

    fake().reply({ op: 'auth', success: true });
    expect(fake().sent[1]).toEqual({ op: 'subscribe', args: ['position.linear', 'order.linear', 'wallet'] });
    expect(handlers.onReady).not.toHaveBeenCalled();

    fake().reply({ op: 'subscribe', success: true });
    expect(handlers.onReady).toHaveBeenCalledTimes(1);
  });

  it('сообщения тем отдаёт дальше, служебные — нет', () => {
    const { handlers, fake } = setup();
    fake().emit('open');
    fake().reply({ op: 'auth', success: true });
    fake().reply({ op: 'subscribe', success: true });
    fake().reply({ op: 'pong' });
    fake().reply({ topic: 'wallet', data: [{ coin: [] }] });
    fake().emit('message', Buffer.from('не json'));
    expect(handlers.onTopic).toHaveBeenCalledTimes(1);
    expect(handlers.onTopic).toHaveBeenCalledWith({ topic: 'wallet', data: [{ coin: [] }] });
  });

  it('отказ входа — onClosed("auth") и закрытый сокет', () => {
    const { handlers, fake } = setup();
    fake().emit('open');
    fake().reply({ op: 'auth', success: false, ret_msg: 'Params Error' });
    expect(handlers.onClosed).toHaveBeenCalledWith('auth');
    expect(fake().closed).toBe(true);
  });

  it('обрыв сообщается один раз; своё закрытие не сообщается вовсе', () => {
    const first = setup();
    first.fake().emit('error', new Error('x'));
    first.fake().emit('close');
    expect(first.handlers.onClosed).toHaveBeenCalledTimes(1);
    expect(first.handlers.onClosed).toHaveBeenCalledWith('closed');

    const second = setup();
    second.socket.close();
    second.fake().emit('close');
    expect(second.handlers.onClosed).not.toHaveBeenCalled();
    expect(second.fake().closed).toBe(true);
  });

  it('пинг раз в 20 с; минута тишины — соединение считается мёртвым', () => {
    const { handlers, fake } = setup();
    fake().emit('open');
    fake().reply({ op: 'auth', success: true });
    fake().reply({ op: 'subscribe', success: true });

    jest.advanceTimersByTime(20_000);
    expect(fake().sent.at(-1)).toEqual({ op: 'ping' });

    fake().reply({ op: 'pong' }); // ответ продлевает жизнь
    jest.advanceTimersByTime(40_000);
    expect(handlers.onClosed).not.toHaveBeenCalled();

    jest.advanceTimersByTime(20_000); // 45+ с без единого сообщения
    expect(handlers.onClosed).toHaveBeenCalledWith('closed');
  });

  it('вход и подписка не уложились в 15 с — соединение не поднялось', () => {
    const { handlers, fake } = setup();
    fake().emit('open');
    jest.advanceTimersByTime(14_999);
    expect(handlers.onClosed).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(handlers.onClosed).toHaveBeenCalledWith('closed');
    expect(fake().closed).toBe(true);
  });

  it('после подписки таймаут готовности снят; idleMs считает тишину', () => {
    const { socket, handlers, fake } = setup();
    fake().emit('open');
    fake().reply({ op: 'auth', success: true });
    fake().reply({ op: 'subscribe', success: true });
    jest.advanceTimersByTime(16_000);
    expect(handlers.onClosed).not.toHaveBeenCalled();
    expect(socket.idleMs()).toBe(16_000);
  });
});
