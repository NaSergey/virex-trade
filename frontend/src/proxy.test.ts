import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { config, proxy } from './proxy';

/** Запрос, как его видит proxy за nginx: свой Host, кука сессии по желанию. */
function req(url: string, opts: { host: string; authed?: boolean; proto?: string }) {
  const headers: Record<string, string> = { host: opts.host };
  if (opts.authed) headers.cookie = 'refresh_token=x';
  if (opts.proto) headers['x-forwarded-proto'] = opts.proto;
  return new NextRequest(new URL(url, `http://${opts.host}`), { headers });
}

const rewriteOf = (res: Response) => {
  const to = res.headers.get('x-middleware-rewrite');
  return to ? new URL(to).pathname + new URL(to).search : null;
};
const locationOf = (res: Response) => res.headers.get('location');

describe('proxy — поддомен админки', () => {
  const host = 'admin.trade-play.com';

  it('без куки любая страница ведёт на вход поддомена — от Host, а не от адреса сервера', () => {
    const res = proxy(req('/saved', { host, proto: 'https' }));
    expect(res.status).toBe(307);
    expect(locationOf(res)).toBe('https://admin.trade-play.com/login?next=%2Fsaved');
  });

  it('/login — всегда форма, даже с кукой (решает страница, а не кука)', () => {
    for (const authed of [false, true]) {
      const res = proxy(req('/login?next=/users', { host, authed }));
      expect(locationOf(res)).toBeNull();
    }
  });

  it('с кукой — пропуск; адреса в app/admin/* переписывает next.config, а не proxy', () => {
    for (const path of ['/', '/users?_rsc=1']) {
      const res = proxy(req(path, { host, authed: true }));
      expect(locationOf(res)).toBeNull();
      expect(rewriteOf(res)).toBeNull();
    }
  });
});

describe('proxy — основной хост', () => {
  const host = 'trade-play.com';

  it('/admin уводит на поддомен, протокол — первый из цепочки прокси', () => {
    const res = proxy(req('/admin/users', { host, proto: 'https, http' }));
    expect(res.status).toBe(307);
    expect(locationOf(res)).toBe('https://admin.trade-play.com/users');
  });

  it('/login и /profile/<id> проходят без куки, как до переноса исключений из matcher', () => {
    for (const path of ['/login', '/profile/abc']) {
      const res = proxy(req(path, { host }));
      expect(locationOf(res)).toBeNull();
      expect(rewriteOf(res)).toBeNull();
    }
  });

  it('защищённая страница без куки — на вход на главной; корень открыт', () => {
    expect(locationOf(proxy(req('/terminal', { host })))).toMatch(/\/\?auth=login&next=%2Fterminal$/);
    expect(locationOf(proxy(req('/', { host })))).toBeNull();
  });

  it('/ru открыт гостю и задаёт язык заголовком запроса; у / заголовка нет', () => {
    const ru = proxy(req('/ru', { host }));
    expect(locationOf(ru)).toBeNull();
    expect(ru.headers.get('x-middleware-request-x-virex-locale')).toBe('ru');
    expect(proxy(req('/', { host })).headers.get('x-middleware-request-x-virex-locale')).toBeNull();
  });

  it('вошедший с обеих главных уходит в терминал', () => {
    for (const path of ['/', '/ru']) {
      expect(locationOf(proxy(req(path, { host, authed: true })))).toMatch(/\/terminal$/);
    }
  });
});

describe('proxy — кука сессии', () => {
  const asked = (host: string, cookie: string) =>
    new NextRequest(new URL('/terminal', `http://${host}`), { headers: { host, cookie } });

  it('вне админки вошедшим считается и новая кука, и старая', () => {
    for (const cookie of ['tp_session=x', 'refresh_token=x']) {
      expect(locationOf(proxy(asked('trade-play.com', cookie)))).toBeNull();
    }
  });

  it('без куки — на вход', () => {
    expect(locationOf(proxy(asked('trade-play.com', 'other=x')))).toMatch(/auth=login/);
  });

  it('админка не считает вошедшим по общей куке: вход у неё свой', () => {
    expect(locationOf(proxy(asked('admin.trade-play.com', 'tp_session=x')))).toMatch(/\/login\?next=/);
    expect(locationOf(proxy(asked('admin.trade-play.com', 'refresh_token=x')))).toBeNull();
  });
});

describe('proxy — matcher', () => {
  const gated = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

  it('файлы для поисковика мимо гейта, страницы — через него', () => {
    for (const path of ['/robots.txt', '/sitemap.xml', '/favicon.ico', '/assets/app/icon.svg']) {
      expect(gated(path)).toBe(false);
    }
    for (const path of ['/', '/ru', '/terminal', '/login']) {
      expect(gated(path)).toBe(true);
    }
  });
});
