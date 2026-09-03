import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClientThrottlerGuard } from './client-throttler.guard';
import { ThrottleBySession } from '../decorators/throttle-by-session.decorator';

/** Хэндлер с реальной меткой декоратора — рефлектор читает её, как в бою. */
const handlerWith = (decorate: boolean): (() => void) => {
  const fn = () => undefined;
  if (decorate) ThrottleBySession()({}, 'refresh', { value: fn });
  return fn;
};

const contextFor = (handler: () => void) =>
  ({
    getHandler: () => handler,
    getClass: () => class Anon {},
  }) as unknown as ExecutionContext;

const makeGuard = () =>
  new ClientThrottlerGuard([] as never, {} as never, new Reflector());

const track = (
  guard: ClientThrottlerGuard,
  req: Record<string, unknown>,
  context: ExecutionContext,
): Promise<string> =>
  (
    guard as never as {
      getTracker: (r: unknown, c: unknown) => Promise<string>;
    }
  ).getTracker(req, context);

describe('ClientThrottlerGuard', () => {
  it('на помеченном эндпоинте считает по сессии, а не по адресу', async () => {
    const ctx = contextFor(handlerWith(true));
    const key = await track(
      makeGuard(),
      { ip: '10.0.0.1', cookies: { refresh_token: 'abc' } },
      ctx,
    );
    expect(key.startsWith('session:')).toBe(true);
    expect(key).not.toContain('10.0.0.1');
  });

  /**
   * Иначе бюджет остался бы общим на всех: за NAT оператора связи или за общим
   * прокси адрес у тысячи пользователей один, и лишних выбрасывало бы из сессии.
   */
  it('разные сессии с одного адреса получают разные бюджеты', async () => {
    const ctx = contextFor(handlerWith(true));
    const guard = makeGuard();
    const one = await track(
      guard,
      { ip: '10.0.0.1', cookies: { refresh_token: 'a' } },
      ctx,
    );
    const two = await track(
      guard,
      { ip: '10.0.0.1', cookies: { refresh_token: 'b' } },
      ctx,
    );
    expect(one).not.toEqual(two);
  });

  it('не кладёт в ключ сам токен', async () => {
    const ctx = contextFor(handlerWith(true));
    const key = await track(
      makeGuard(),
      { ip: '10.0.0.1', cookies: { refresh_token: 'secret' } },
      ctx,
    );
    expect(key).not.toContain('secret');
  });

  /**
   * Самое важное свойство: на входе и регистрации ключ обязан быть от адреса.
   * Считай их по куке — и подбор пароля обходил бы лимит, меняя её на каждой
   * попытке, потому что значение куки выбирает сам клиент.
   */
  it('на непомеченном эндпоинте кука не влияет на ключ', async () => {
    const ctx = contextFor(handlerWith(false));
    const guard = makeGuard();
    const withCookie = await track(
      guard,
      { ip: '10.0.0.1', cookies: { refresh_token: 'a' } },
      ctx,
    );
    const without = await track(guard, { ip: '10.0.0.1', cookies: {} }, ctx);
    expect(withCookie).toEqual('ip:10.0.0.1');
    expect(withCookie).toEqual(without);
  });

  it('без куки на помеченном эндпоинте откатывается к адресу', async () => {
    const ctx = contextFor(handlerWith(true));
    const key = await track(makeGuard(), { ip: '10.0.0.1', cookies: {} }, ctx);
    expect(key).toEqual('ip:10.0.0.1');
  });
});
