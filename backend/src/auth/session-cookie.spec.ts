import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { trustProxy } from '../http-proxy';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { sharedDomain } from './session-cookie';

const RESULT = { user: { id: 'u' }, accessToken: 'a', refreshToken: 'NEW' };
const service = {
  login: jest.fn(async () => RESULT),
  refresh: jest.fn(async () => RESULT),
  logout: jest.fn(async () => undefined),
  refreshCookieMaxAgeMs: 1000,
};

describe('кука сессии', () => {
  let app: INestApplication;
  const before = process.env.FRONTEND_URL;

  beforeEach(async () => {
    process.env.FRONTEND_URL = 'https://trade-play.com';
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }])],
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    }).compile();
    const nest = module.createNestApplication<NestExpressApplication>();
    trustProxy(nest);
    nest.use(cookieParser());
    await nest.init();
    app = nest;
  });
  afterEach(() => app.close());
  afterAll(() => {
    process.env.FRONTEND_URL = before;
  });

  const post = (path: string, host: string, cookie?: string) => {
    const r = request(app.getHttpServer())
      .post(path)
      .set('X-Forwarded-Host', host);
    return cookie ? r.set('Cookie', cookie) : r;
  };
  const cookies = (res: request.Response) =>
    (res.headers['set-cookie'] ?? []) as unknown as string[];
  const named = (res: request.Response, name: string) =>
    cookies(res).filter((c) => c.startsWith(`${name}=`));

  it.each(['trade-play.com', 'journal.trade-play.com'])(
    'вход на %s — кука на весь домен',
    async (host) => {
      const res = await post('/auth/login', host).send({
        email: 'a@b.c',
        password: 'x',
      });
      const [c] = named(res, 'tp_session');
      expect(c).toContain('tp_session=NEW');
      expect(c).toContain('Domain=trade-play.com');
      expect(c).toContain('HttpOnly');
      expect(c).toContain('Secure');
    },
  );

  it('вход на admin.* — своя кука без Domain, общей нет', async () => {
    const res = await post('/auth/login', 'admin.trade-play.com').send({
      email: 'a@b.c',
      password: 'x',
    });
    expect(named(res, 'tp_session')).toEqual([]);
    const live = named(res, 'refresh_token').find((c) =>
      c.startsWith('refresh_token=NEW'),
    );
    expect(live).toBeDefined();
    expect(live).not.toContain('Domain=');
  });

  it('чужой адрес — кука без Domain: копия сайта не пишет куку на наш домен', async () => {
    const res = await post('/auth/login', 'evil.example').send({
      email: 'a@b.c',
      password: 'x',
    });
    expect(named(res, 'tp_session')[0]).not.toContain('Domain=');
  });

  it('старая кука переходит в новую без повторного входа и гасится', async () => {
    const res = await post(
      '/auth/refresh',
      'trade-play.com',
      'refresh_token=OLD',
    );
    expect(service.refresh).toHaveBeenCalledWith('OLD');
    expect(named(res, 'tp_session')[0]).toContain('tp_session=NEW');
    const cleared = named(res, 'refresh_token').filter((c) =>
      /Expires=Thu, 01 Jan 1970/.test(c),
    );
    expect(cleared.some((c) => /Path=\/(;|$)/.test(c))).toBe(true);
  });

  it('новая сильнее старой', async () => {
    await post(
      '/auth/refresh',
      'trade-play.com',
      'refresh_token=OLD; tp_session=FRESH',
    );
    expect(service.refresh).toHaveBeenCalledWith('FRESH');
  });

  it('админка читает только свою: общая кука доезжает, но не считается', async () => {
    await post(
      '/auth/refresh',
      'admin.trade-play.com',
      'tp_session=FRESH; refresh_token=ADMIN',
    );
    expect(service.refresh).toHaveBeenCalledWith('ADMIN');
  });

  it('на админке с одной общей кукой сессии нет: чужая кука там не считается', async () => {
    await post('/auth/refresh', 'admin.trade-play.com', 'tp_session=FRESH');
    expect(service.refresh).toHaveBeenCalledWith(undefined);
  });

  it('без X-Forwarded-Host адрес берётся из Host: так приходит запрос мимо Next', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Host', 'journal.trade-play.com')
      .send({ email: 'a@b.c', password: 'x' });
    expect(named(res, 'tp_session')[0]).toContain('Domain=trade-play.com');
  });

  it('выход гасит общую на весь домен и старую', async () => {
    const res = await post(
      '/auth/logout',
      'journal.trade-play.com',
      'tp_session=FRESH',
    );
    expect(service.logout).toHaveBeenCalledWith('FRESH');
    const c = named(res, 'tp_session')[0];
    expect(c).toContain('Domain=trade-play.com');
    expect(c).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(named(res, 'refresh_token').length).toBeGreaterThan(0);
  });

  it('выход из админки общую куку не трогает: сессия площадки живёт своей жизнью', async () => {
    const res = await post(
      '/auth/logout',
      'admin.trade-play.com',
      'tp_session=FRESH; refresh_token=ADMIN',
    );
    expect(service.logout).toHaveBeenCalledWith('ADMIN');
    expect(named(res, 'tp_session')).toEqual([]);
  });
});

describe('sharedDomain', () => {
  const url = 'https://trade-play.com';

  it('свой домен и журнал — домен из FRONTEND_URL, регистр не важен', () => {
    expect(sharedDomain('trade-play.com', url)).toBe('trade-play.com');
    expect(sharedDomain('JOURNAL.trade-play.com', url)).toBe('trade-play.com');
  });

  it('админка, чужой адрес и пусто — без Domain', () => {
    expect(sharedDomain('admin.trade-play.com', url)).toBeUndefined();
    expect(sharedDomain('evil.example', url)).toBeUndefined();
    expect(sharedDomain(undefined, url)).toBeUndefined();
  });

  it('localhost, IP и кривой адрес — без Domain: браузер такую куку выбросил бы', () => {
    expect(sharedDomain('localhost', 'http://localhost:8090')).toBeUndefined();
    expect(sharedDomain('93.187.64.13', 'http://93.187.64.13')).toBeUndefined();
    expect(sharedDomain('trade-play.com', undefined)).toBeUndefined();
  });
});
