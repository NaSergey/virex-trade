import { GamesGateway } from './games.gateway';

function makeSocket(auth: Record<string, unknown> = {}) {
  return {
    handshake: { auth },
    data: {} as Record<string, unknown>,
    disconnect: jest.fn(),
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
