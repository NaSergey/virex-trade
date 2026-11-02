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

});

describe('proxy — части', () => {
  const play = 'trade-play.com';
  const journal = 'journal.trade-play.com';

  it('адрес журнала на площадке — в журнал с путём и запросом, 307', () => {
    const res = proxy(req('/analytics?tags=1', { host: play, authed: true, proto: 'https' }));
    expect(res.status).toBe(307);
    expect(locationOf(res)).toBe('https://journal.trade-play.com/analytics?tags=1');
  });

  it('гость тоже уходит в журнал: вход спросит уже он', () => {
    expect(locationOf(proxy(req('/terminal', { host: play, proto: 'https' })))).toBe(
      'https://journal.trade-play.com/terminal',
    );
  });

  it('адрес площадки в журнале — на площадку', () => {
    expect(locationOf(proxy(req('/games/poker', { host: journal, authed: true, proto: 'https' })))).toBe(
      'https://trade-play.com/games/poker',
    );
    expect(locationOf(proxy(req('/profile/abc', { host: journal, proto: 'https' })))).toBe(
      'https://trade-play.com/profile/abc',
    );
  });

  it('приглашение в турнир из журнала не теряет запрос', () => {
    expect(locationOf(proxy(req('/games/trading?t=abc', { host: journal, proto: 'https' })))).toBe(
      'https://trade-play.com/games/trading?t=abc',
    );
  });

  it('внутренний адрес главной журнала на площадке — на настоящую', () => {
    expect(locationOf(proxy(req('/journal', { host: play, proto: 'https' })))).toBe('https://journal.trade-play.com/');
    expect(locationOf(proxy(req('/journal/ru', { host: play, proto: 'https' })))).toBe(
      'https://journal.trade-play.com/ru',
    );
  });

  it('внутренний адрес на самом журнале — на настоящую главную, а не вторая её копия', () => {
    expect(locationOf(proxy(req('/journal', { host: journal, proto: 'https' })))).toBe('https://journal.trade-play.com/');
    expect(locationOf(proxy(req('/journal/ru', { host: journal, proto: 'https' })))).toBe(
      'https://journal.trade-play.com/ru',
    );
  });

  it('в журнал по закладке — вместе с выбранным языком, на весь домен', () => {
    const asked = new NextRequest(new URL('/terminal', `http://${play}`), {
      headers: { host: play, cookie: 'virex-locale=ru', 'x-forwarded-proto': 'https' },
    });
    const carried = proxy(asked).headers.get('set-cookie') ?? '';
    expect(carried).toContain('virex-locale=ru');
    expect(carried).toMatch(/Domain=trade-play\.com/i);
  });

  it('языка не выбирали или адрес чужой — куку не придумываем', () => {
    expect(proxy(req('/terminal', { host: play, proto: 'https' })).headers.get('set-cookie')).toBeNull();
    const local = new NextRequest(new URL('/terminal', 'http://localhost:8090'), {
      headers: { host: 'localhost:8090', cookie: 'virex-locale=ru' },
    });
    expect(proxy(local).headers.get('set-cookie')).toBeNull();
  });

  it('старая кука сессии считается и в журнале', () => {
    const asked = new NextRequest(new URL('/terminal', `http://${journal}`), {
      headers: { host: journal, cookie: 'refresh_token=x' },
    });
    expect(locationOf(proxy(asked))).toBeNull();
  });

  it('/ и /ru вошедшего: площадка — витрина, журнал — терминал', () => {
    for (const path of ['/', '/ru']) {
      expect(locationOf(proxy(req(path, { host: play, authed: true })))).toMatch(/\/games$/);
      expect(locationOf(proxy(req(path, { host: journal, authed: true })))).toMatch(/\/terminal$/);
    }
  });

  it('/ и /ru гостя открыты в обеих частях; язык задаёт только /ru', () => {
    for (const host of [play, journal]) {
      const root = proxy(req('/', { host }));
      expect(locationOf(root)).toBeNull();
      expect(root.headers.get('x-middleware-request-x-virex-locale')).toBeNull();
      const ru = proxy(req('/ru', { host }));
      expect(locationOf(ru)).toBeNull();
      expect(ru.headers.get('x-middleware-request-x-virex-locale')).toBe('ru');
    }
  });

  it('закрытая страница гостя — на главную своей части', () => {
    expect(locationOf(proxy(req('/games/poker', { host: play })))).toMatch(/\/\?auth=login&next=%2Fgames%2Fpoker$/);
    expect(locationOf(proxy(req('/terminal', { host: journal })))).toMatch(/\/\?auth=login&next=%2Fterminal$/);
  });

  it('своя часть с кукой — пропуск; приглашение на профиль гостю открыто на площадке', () => {
    expect(locationOf(proxy(req('/games/poker', { host: play, authed: true })))).toBeNull();
    expect(locationOf(proxy(req('/terminal', { host: journal, authed: true })))).toBeNull();
    expect(locationOf(proxy(req('/profile/abc', { host: play })))).toBeNull();
  });

  it('админка своей развилкой: адреса частей там не уводятся', () => {
    expect(locationOf(proxy(req('/terminal', { host: 'admin.trade-play.com', authed: true })))).toBeNull();
    expect(locationOf(proxy(req('/games', { host: 'admin.trade-play.com', authed: true })))).toBeNull();
  });
});

describe('proxy — кука сессии', () => {
  const asked = (host: string, cookie: string) =>
    new NextRequest(new URL('/games', `http://${host}`), { headers: { host, cookie } });

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
