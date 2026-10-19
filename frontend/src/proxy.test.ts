import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

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
});
