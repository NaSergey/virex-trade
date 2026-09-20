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

describe('GamesGateway.handleConnection', () => {
  it('без токена соединение обрывается', async () => {
    const jwt = { verifyAsync: jest.fn() };
    const gateway = new GamesGateway(jwt as never);
    const socket = makeSocket();

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('невалидный токен обрывает соединение', async () => {
    const jwt = { verifyAsync: jest.fn().mockRejectedValue(new Error('bad token')) };
    const gateway = new GamesGateway(jwt as never);
    const socket = makeSocket({ token: 'bad' });

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('валидный токен кладёт userId в data и не обрывает соединение', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', email: 'u1@example.com' }) };
    const gateway = new GamesGateway(jwt as never);
    const socket = makeSocket({ token: 'good' });

    await gateway.handleConnection(socket as never);

    expect(socket.data.userId).toBe('u1');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('нестроковый токен обрывает соединение так же, как отсутствующий', async () => {
    const jwt = { verifyAsync: jest.fn() };
    const gateway = new GamesGateway(jwt as never);
    const socket = makeSocket({ token: 42 });

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
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
