import { GamesGateway } from './games.gateway';

function makeSocket(auth: Record<string, unknown> = {}) {
  return {
    handshake: { auth },
    data: {} as Record<string, unknown>,
    disconnect: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
  };
}

/**
 * Аутентификация теперь — middleware, поставленный в `afterInit`, а не
 * `handleConnection`: socket.io шлёт пакет CONNECT раньше этого хука, и отказ
 * после него клиент видел бы как обрыв связи и переподключался бы тем же
 * мёртвым токеном бесконечно. Middleware достаётся вызовом `afterInit` на
 * фейковом сервере и извлечением функции, переданной в `server.use`.
 */
describe('GamesGateway auth middleware', () => {
  function getMiddleware(jwt: { verifyAsync: jest.Mock }) {
    const gateway = new GamesGateway(jwt as never);
    const fakeServer = { use: jest.fn(), on: jest.fn() };
    gateway.afterInit(fakeServer as never);
    return fakeServer.use.mock.calls[0][0] as (
      socket: unknown,
      next: (err?: Error) => void,
    ) => Promise<void>;
  }

  it('без токена отказывает и не проверяет его', async () => {
    const jwt = { verifyAsync: jest.fn() };
    const middleware = getMiddleware(jwt);
    const socket = makeSocket();
    const next = jest.fn();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('нестроковый токен отказывает так же, как отсутствующий', async () => {
    const jwt = { verifyAsync: jest.fn() };
    const middleware = getMiddleware(jwt);
    const socket = makeSocket({ token: 42 });
    const next = jest.fn();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('невалидный токен отказывает', async () => {
    const jwt = {
      verifyAsync: jest.fn().mockRejectedValue(new Error('bad token')),
    };
    const middleware = getMiddleware(jwt);
    const socket = makeSocket({ token: 'bad' });
    const next = jest.fn();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('валидный токен кладёт userId в data и пропускает без ошибки', async () => {
    const jwt = {
      verifyAsync: jest
        .fn()
        .mockResolvedValue({ sub: 'u1', email: 'u1@example.com' }),
    };
    const middleware = getMiddleware(jwt);
    const socket = makeSocket({ token: 'good' });
    const next = jest.fn();

    await middleware(socket, next);

    expect(socket.data.userId).toBe('u1');
    expect(next).toHaveBeenCalledWith();
  });
});

describe('GamesGateway.handleJoinTable / handleLeaveTable', () => {
  it('join_table до выставления userId не присоединяет к комнате', () => {
    const gateway = new GamesGateway({} as never);
    const socket = makeSocket();

    gateway.handleJoinTable(socket as never, 'gt1');

    expect(socket.join).not.toHaveBeenCalled();
  });

  it('leave_table до выставления userId не покидает комнату', () => {
    const gateway = new GamesGateway({} as never);
    const socket = makeSocket();

    gateway.handleLeaveTable(socket as never, 'gt1');

    expect(socket.leave).not.toHaveBeenCalled();
  });

  it('нестроковый tableId в join_table не присоединяет к комнате', () => {
    const gateway = new GamesGateway({} as never);
    const socket = makeSocket();
    socket.data.userId = 'u1';

    gateway.handleJoinTable(socket as never, 42);

    expect(socket.join).not.toHaveBeenCalled();
  });

  it('нестроковый tableId в leave_table не покидает комнату', () => {
    const gateway = new GamesGateway({} as never);
    const socket = makeSocket();
    socket.data.userId = 'u1';

    gateway.handleLeaveTable(socket as never, 42);

    expect(socket.leave).not.toHaveBeenCalled();
  });

  it('валидный вызов с userId и строковым tableId присоединяет к комнате', () => {
    const gateway = new GamesGateway({} as never);
    const socket = makeSocket();
    socket.data.userId = 'u1';

    gateway.handleJoinTable(socket as never, 'gt1');

    expect(socket.join).toHaveBeenCalledWith('gt1');
  });
});

describe('GamesGateway.broadcastTableState', () => {
  it('рассылает снимок в комнату с id стола', () => {
    const gateway = new GamesGateway({} as never);
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gateway as unknown as { server: unknown }).server = { to };

    gateway.broadcastTableState('gt1', { table: { id: 'gt1' } });

    expect(to).toHaveBeenCalledWith('gt1');
    expect(emit).toHaveBeenCalledWith('table_state', { table: { id: 'gt1' } });
  });
});

describe('GamesGateway.listen', () => {
  it('отдаёт событие сокета обработчику вместе с userId из рукопожатия', () => {
    const gateway = new GamesGateway({ verifyAsync: jest.fn() } as never);
    const fakeServer = { use: jest.fn(), on: jest.fn() };
    gateway.afterInit(fakeServer as never);
    const handler = jest.fn();
    gateway.listen('race_input', handler);

    const onConnection = fakeServer.on.mock.calls.find(
      ([e]) => e === 'connection',
    )![1] as (s: unknown) => void;
    const listeners = new Map<string, (p: unknown) => void>();
    const socket = {
      data: { userId: 'u1' },
      on: (e: string, fn: (p: unknown) => void) => listeners.set(e, fn),
    };
    onConnection(socket);
    listeners.get('race_input')!({ t: 1 });
    expect(handler).toHaveBeenCalledWith('u1', { t: 1 });
  });

  it('сокет без userId обработчика не достигает', () => {
    const gateway = new GamesGateway({ verifyAsync: jest.fn() } as never);
    const fakeServer = { use: jest.fn(), on: jest.fn() };
    gateway.afterInit(fakeServer as never);
    const handler = jest.fn();
    gateway.listen('race_input', handler);
    const onConnection = fakeServer.on.mock.calls[0][1] as (s: unknown) => void;
    const listeners = new Map<string, (p: unknown) => void>();
    onConnection({
      data: {},
      on: (e: string, fn: (p: unknown) => void) => listeners.set(e, fn),
    });
    listeners.get('race_input')?.({ t: 1 });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('GamesGateway.listen — сбой обработчика', () => {
  it('исключение обработчика не выходит наружу', () => {
    const gateway = new GamesGateway({ verifyAsync: jest.fn() } as never);
    const fakeServer = { use: jest.fn(), on: jest.fn() };
    gateway.afterInit(fakeServer as never);
    jest
      .spyOn(
        (gateway as unknown as { logger: { error: () => void } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);
    gateway.listen('race_input', () => {
      throw new Error('boom');
    });
    const onConnection = fakeServer.on.mock.calls[0][1] as (s: unknown) => void;
    const listeners = new Map<string, (p: unknown) => void>();
    onConnection({
      data: { userId: 'u1' },
      on: (e: string, fn: (p: unknown) => void) => listeners.set(e, fn),
    });
    expect(() => listeners.get('race_input')!({ t: 1 })).not.toThrow();
  });
});
