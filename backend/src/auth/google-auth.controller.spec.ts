import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { decodeState } from './google-oauth';
import { trustProxy } from '../http-proxy';

/**
 * Вход через Google маршрутами, через настоящий Express: куки, редиректы и
 * Host за прокси (`x-forwarded-host` ставит Next на rewrites). Google подменён
 * `fetch`, аккаунт — заглушкой `AuthService`.
 */

const CLIENT_ID = 'client-1.apps.googleusercontent.com';
const ENV = {
  FRONTEND_URL: 'https://trade-play.com',
  GOOGLE_CLIENT_ID: CLIENT_ID,
  GOOGLE_CLIENT_SECRET: 'secret-1',
};

function idToken(payload: Record<string, unknown>): string {
  const part = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(payload)}.sig`;
}

const goodToken = () =>
  idToken({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 600,
    sub: 'sub-1',
    email: 'ivan@gmail.com',
    email_verified: true,
    name: 'Иван',
  });

const cookiesOf = (res: request.Response): string[] => {
  const raw = res.headers['set-cookie'] as unknown;
  return Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
};
const cookie = (res: request.Response, name: string) =>
  cookiesOf(res).find((c) => c.startsWith(`${name}=`));
const valueOf = (c: string | undefined) =>
  (c ?? '').split(';')[0].split('=')[1] ?? '';

describe('AuthController: вход через Google', () => {
  let app: INestApplication;
  const saved: Record<string, string | undefined> = {};
  const auth = {
    signInWithGoogle: jest.fn(),
    refreshCookieMaxAgeMs: 60_000,
  };
  let fetchSpy: jest.SpyInstance;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: auth }],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    trustProxy(app as NestExpressApplication);
    app.use(cookieParser());
    await app.init();
  });
  afterAll(() => app.close());

  beforeEach(() => {
    for (const [k, v] of Object.entries(ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    auth.signInWithGoogle.mockReset().mockResolvedValue({
      user: { id: 'u1' },
      accessToken: 'access',
      refreshToken: 'refresh-raw',
    });
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ id_token: goodToken() }), {
          status: 200,
        }),
    );
  });
  afterEach(() => {
    for (const k of Object.keys(ENV)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    fetchSpy.mockRestore();
  });

  /** Шаг 1 на хосте журнала, как его видит api за Next. */
  const start = (query: string, host = 'journal.trade-play.com') =>
    request(app.getHttpServer())
      .get(`/auth/google${query}`)
      .set('X-Forwarded-Host', host);

  it('шаг 1: кука состояния и уход на Google с адресом возврата той же части', async () => {
    const res = await start('?next=%2Fterminal&ref=friend').expect(302);

    const to = new URL(res.headers.location);
    expect(to.origin).toBe('https://accounts.google.com');
    expect(to.searchParams.get('redirect_uri')).toBe(
      'https://journal.trade-play.com/auth/google/callback',
    );

    const c = cookie(res, 'tp_oauth');
    expect(c).toMatch(/Path=\/auth\/google/);
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Lax/);
    expect(c).toMatch(/Secure/);
    const st = decodeState(decodeURIComponent(valueOf(c)));
    expect(st).toMatchObject({
      next: '/terminal',
      ref: 'friend',
      state: to.searchParams.get('state'),
    });
  });

  it('шаг 1: чужой адрес в next не уезжает в куку', async () => {
    const res = await start('?next=%2F%2Fevil.example').expect(302);
    expect(
      decodeState(decodeURIComponent(valueOf(cookie(res, 'tp_oauth'))))?.next,
    ).toBe('/');
  });

  it('шаг 1 без ключей Google — назад к форме с ошибкой, без куки', async () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    const res = await start('', 'trade-play.com').expect(302);
    expect(res.headers.location).toBe(
      'https://trade-play.com/?auth=login&error=GOOGLE_FAILED',
    );
    expect(cookie(res, 'tp_oauth')).toBeUndefined();
  });

  /** Полный круг: шаг 1, затем колбэк с той же кукой и state (или подменённым). */
  async function roundTrip(opts: { state?: string; extra?: string } = {}) {
    const first = await start('?next=%2Fterminal&ref=friend');
    const oauth = valueOf(cookie(first, 'tp_oauth'));
    const state =
      opts.state ?? new URL(first.headers.location).searchParams.get('state')!;
    return request(app.getHttpServer())
      .get(
        `/auth/google/callback?code=code-1&state=${encodeURIComponent(state)}${opts.extra ?? ''}`,
      )
      .set('X-Forwarded-Host', 'journal.trade-play.com')
      .set('Cookie', `tp_oauth=${oauth}`);
  }

  it('шаг 2: код меняется на токен, сессия ставится на весь домен, возврат на next', async () => {
    const res = await roundTrip();

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(
      'https://journal.trade-play.com/terminal',
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.anything(),
    );
    const body = new URLSearchParams(String(fetchSpy.mock.calls[0][1].body));
    expect(body.get('redirect_uri')).toBe(
      'https://journal.trade-play.com/auth/google/callback',
    );
    expect(body.get('code')).toBe('code-1');
    expect(auth.signInWithGoogle).toHaveBeenCalledWith(
      { sub: 'sub-1', email: 'ivan@gmail.com', name: 'Иван' },
      'friend',
    );
    const session = cookie(res, 'tp_session');
    expect(valueOf(session)).toBe('refresh-raw');
    expect(session).toMatch(/Domain=trade-play\.com/);
    // Кука состояния одноразовая.
    expect(cookie(res, 'tp_oauth')).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('шаг 2: state не совпал — к форме с ошибкой, ни обмена кода, ни входа', async () => {
    const res = await roundTrip({ state: 'forged' });

    expect(res.headers.location).toBe(
      'https://journal.trade-play.com/?auth=login&next=%2Fterminal&error=GOOGLE_FAILED',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(auth.signInWithGoogle).not.toHaveBeenCalled();
    expect(cookie(res, 'tp_session')).toBeUndefined();
  });

  it('шаг 2 без куки состояния — отказ (подделка входа чужим кодом)', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/google/callback?code=code-1&state=any')
      .set('X-Forwarded-Host', 'trade-play.com')
      .expect(302);
    expect(res.headers.location).toBe(
      'https://trade-play.com/?auth=login&error=GOOGLE_FAILED',
    );
    expect(auth.signInWithGoogle).not.toHaveBeenCalled();
  });

  it('шаг 2: отказ на экране Google — к форме без сообщения', async () => {
    const res = await roundTrip({ extra: '&error=access_denied' });
    expect(res.headers.location).toBe(
      'https://journal.trade-play.com/?auth=login&next=%2Fterminal',
    );
    expect(auth.signInWithGoogle).not.toHaveBeenCalled();
  });

  it('шаг 2: Google отклонил код — к форме с ошибкой', async () => {
    fetchSpy.mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 400,
        }),
    );
    const res = await roundTrip();
    expect(res.headers.location).toMatch(/error=GOOGLE_FAILED$/);
    expect(auth.signInWithGoogle).not.toHaveBeenCalled();
  });

  it('шаг 2: аккаунт не выдан (демо-почта) — к форме с ошибкой', async () => {
    auth.signInWithGoogle.mockRejectedValue(new Error('ACCOUNT_DEMO_LOCKED'));
    const res = await roundTrip();
    expect(res.headers.location).toMatch(/error=GOOGLE_FAILED$/);
    expect(cookie(res, 'tp_session')).toBeUndefined();
  });
});
