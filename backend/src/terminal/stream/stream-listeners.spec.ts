import { StreamListeners } from './stream-listeners';
import type { StreamContext, StreamListener } from './stop-follow.service';

const ctx = {} as StreamContext;
const listener = (users: string[], extra: Partial<StreamListener> = {}): StreamListener => ({
  pinned: jest.fn(async () => users),
  onEvent: jest.fn(),
  onSnapshot: jest.fn(),
  onIdle: jest.fn(),
  ...extra,
});

describe('StreamListeners', () => {
  it('держит соединение тем, кого просит любой слушатель, без повторов', async () => {
    const all = new StreamListeners([listener(['u1', 'u2']), listener(['u2', 'u3'])]);
    expect((await all.pinned()).sort()).toEqual(['u1', 'u2', 'u3']);
  });

  it('событие, снимок и тик идут каждому слушателю', () => {
    const a = listener([]);
    const b = listener([]);
    const all = new StreamListeners([a, b]);
    const msg = { topic: 'order.linear', data: [] };
    all.onEvent('u1', msg, ctx);
    all.onSnapshot('u1', ctx);
    all.onIdle('u1', ctx);
    for (const l of [a, b]) {
      expect(l.onEvent).toHaveBeenCalledWith('u1', msg, ctx);
      expect(l.onSnapshot).toHaveBeenCalledWith('u1', ctx);
      expect(l.onIdle).toHaveBeenCalledWith('u1', ctx);
    }
  });

  it('упавший слушатель остальным не мешает', () => {
    const broken = listener([], {
      onEvent: jest.fn(() => {
        throw new Error('boom');
      }),
    });
    const ok = listener([]);
    new StreamListeners([broken, ok]).onEvent('u1', { topic: 'x', data: [] }, ctx);
    expect(ok.onEvent).toHaveBeenCalled();
  });
});
