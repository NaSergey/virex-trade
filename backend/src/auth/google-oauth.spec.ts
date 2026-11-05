import { createHash } from 'crypto';
import {
  authorizeUrl,
  callbackUrl,
  claimsFromIdToken,
  decodeState,
  encodeState,
  exchangeCode,
  googleConfig,
  newOAuthState,
  partOrigin,
  pickName,
  safeNextPath,
} from './google-oauth';

const CFG = {
  clientId: 'client-1.apps.googleusercontent.com',
  clientSecret: 'secret-1',
};
const NOW = Date.UTC(2026, 10, 5, 12);

/** id_token без подписи: сервер его не проверяет подписью — он пришёл от Google по TLS. */
function idToken(payload: Record<string, unknown>): string {
  const part = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(payload)}.signature`;
}

const goodPayload = {
  iss: 'https://accounts.google.com',
  aud: CFG.clientId,
  exp: NOW / 1000 + 600,
  sub: '1234567890',
  email: 'Ivan.Petrov@gmail.com',
  email_verified: true,
  name: 'Иван Петров',
  given_name: 'Иван',
};

describe('googleConfig', () => {
  it('нет любой из переменных — вход через Google выключен', () => {
    expect(googleConfig({ GOOGLE_CLIENT_ID: 'a' })).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_SECRET: 'b' })).toBeNull();
    expect(
      googleConfig({ GOOGLE_CLIENT_ID: ' ', GOOGLE_CLIENT_SECRET: 'b' }),
    ).toBeNull();
  });

  it('обе заданы — конфиг без пробелов по краям', () => {
    expect(
      googleConfig({ GOOGLE_CLIENT_ID: ' a ', GOOGLE_CLIENT_SECRET: 'b\n' }),
    ).toEqual({
      clientId: 'a',
      clientSecret: 'b',
    });
  });
});

describe('partOrigin', () => {
  it('площадка — origin FRONTEND_URL', () => {
    expect(partOrigin('trade-play.com', 'https://trade-play.com')).toBe(
      'https://trade-play.com',
    );
  });

  it('журнал — тот же origin с journal. перед хостом', () => {
    expect(partOrigin('journal.trade-play.com', 'https://trade-play.com')).toBe(
      'https://journal.trade-play.com',
    );
  });

  it('порт локального адреса сохраняется', () => {
    expect(partOrigin('journal.localhost', 'http://localhost:8090')).toBe(
      'http://journal.localhost:8090',
    );
    expect(partOrigin('localhost', 'http://localhost:8090')).toBe(
      'http://localhost:8090',
    );
  });

  it('чужой Host не попадает в адрес — остаётся FRONTEND_URL', () => {
    expect(partOrigin('evil.example', 'https://trade-play.com')).toBe(
      'https://trade-play.com',
    );
    expect(partOrigin('journal.evil.example', 'https://trade-play.com')).toBe(
      'https://trade-play.com',
    );
  });

  it('FRONTEND_URL не разбирается — null', () => {
    expect(partOrigin('trade-play.com', undefined)).toBeNull();
    expect(partOrigin('trade-play.com', 'not a url')).toBeNull();
  });
});

describe('callbackUrl', () => {
  it('колбэк — на том же origin', () => {
    expect(callbackUrl('https://journal.trade-play.com')).toBe(
      'https://journal.trade-play.com/auth/google/callback',
    );
  });
});

describe('safeNextPath', () => {
  const origin = 'https://trade-play.com';

  it('путь внутри продукта — как есть', () => {
    expect(safeNextPath('/games/poker?t=1', origin)).toBe('/games/poker?t=1');
  });

  it.each([
    ['//evil.example'],
    ['/\\evil.example'],
    ['/\t/evil.example'],
    ['https://evil.example/'],
    ['games'],
    [''],
    [undefined],
    [['/games']],
  ])('%p — на главную', (raw) => {
    expect(safeNextPath(raw, origin)).toBe('/');
  });

  it('слишком длинный — на главную: он едет в куке', () => {
    expect(safeNextPath(`/${'a'.repeat(600)}`, origin)).toBe('/');
  });
});

describe('состояние входа в куке', () => {
  it('кодируется и читается обратно', () => {
    const st = newOAuthState('/terminal', 'friend');
    expect(decodeState(encodeState(st))).toEqual(st);
  });

  it('у каждого входа свои state и verifier', () => {
    const a = newOAuthState('/');
    const b = newOAuthState('/');
    expect(a.state).not.toBe(b.state);
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.verifier.length).toBeGreaterThanOrEqual(43); // RFC 7636: 43–128 знаков
  });

  it.each([
    [undefined],
    [''],
    ['не base64'],
    [Buffer.from('{"state":1}').toString('base64url')],
  ])('мусор — null: %p', (raw) => {
    expect(decodeState(raw)).toBeNull();
  });
});

describe('authorizeUrl', () => {
  it('ссылка на Google с PKCE S256, state и выбором аккаунта', () => {
    const st = newOAuthState('/');
    const url = new URL(
      authorizeUrl(CFG, 'https://trade-play.com/auth/google/callback', st),
    );

    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    const q = url.searchParams;
    expect(q.get('client_id')).toBe(CFG.clientId);
    expect(q.get('redirect_uri')).toBe(
      'https://trade-play.com/auth/google/callback',
    );
    expect(q.get('response_type')).toBe('code');
    expect(q.get('scope')).toBe('openid email profile');
    expect(q.get('state')).toBe(st.state);
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('code_challenge')).toBe(
      createHash('sha256').update(st.verifier).digest('base64url'),
    );
    expect(q.get('prompt')).toBe('select_account');
  });
});

describe('claimsFromIdToken', () => {
  it('достаёт sub, почту в нижнем регистре и имена', () => {
    expect(claimsFromIdToken(idToken(goodPayload), CFG.clientId, NOW)).toEqual({
      sub: '1234567890',
      email: 'ivan.petrov@gmail.com',
      name: 'Иван Петров',
      givenName: 'Иван',
    });
  });

  it('iss без схемы тоже принимается — Google отдаёт оба вида', () => {
    const t = idToken({ ...goodPayload, iss: 'accounts.google.com' });
    expect(claimsFromIdToken(t, CFG.clientId, NOW).sub).toBe('1234567890');
  });

  it('aud списком с нашим client id принимается', () => {
    const t = idToken({ ...goodPayload, aud: ['other', CFG.clientId] });
    expect(claimsFromIdToken(t, CFG.clientId, NOW).sub).toBe('1234567890');
  });

  it.each([
    ['чужой iss', { iss: 'https://evil.example' }],
    ['чужой aud', { aud: 'other-client' }],
    ['истёк', { exp: NOW / 1000 - 1 }],
    ['почта не подтверждена', { email_verified: false }],
    ['почта подтверждена строкой', { email_verified: 'true' }],
    ['нет sub', { sub: undefined }],
    ['нет почты', { email: undefined }],
  ])('%s — отказ', (_, patch) => {
    expect(() =>
      claimsFromIdToken(
        idToken({ ...goodPayload, ...patch }),
        CFG.clientId,
        NOW,
      ),
    ).toThrow();
  });

  it.each([[undefined], ['abc'], ['a.b.c'], [42]])(
    'не токен — отказ: %p',
    (raw) => {
      expect(() => claimsFromIdToken(raw, CFG.clientId, NOW)).toThrow();
    },
  );
});

describe('exchangeCode', () => {
  it('меняет код на id_token: client_secret, redirect_uri и code_verifier уходят формой', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({ id_token: 'the-token', access_token: 'x' }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    await expect(
      exchangeCode(
        CFG,
        'code-1',
        'https://trade-play.com/auth/google/callback',
        'ver-1',
        fetchFn,
      ),
    ).resolves.toBe('the-token');
    expect(calls[0].url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(String(calls[0].init.body));
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      client_id: CFG.clientId,
      client_secret: CFG.clientSecret,
      redirect_uri: 'https://trade-play.com/auth/google/callback',
      code_verifier: 'ver-1',
    });
  });

  it('отказ Google — ошибка с его текстом', async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 400,
      })) as unknown as typeof fetch;
    await expect(exchangeCode(CFG, 'c', 'r', 'v', fetchFn)).rejects.toThrow(
      /invalid_grant/,
    );
  });

  it('ответ без id_token — ошибка', async () => {
    const fetchFn = (async () =>
      new Response('{}', { status: 200 })) as unknown as typeof fetch;
    await expect(exchangeCode(CFG, 'c', 'r', 'v', fetchFn)).rejects.toThrow();
  });
});

describe('pickName', () => {
  const base = { sub: '1', email: 'ivan.petrov@gmail.com' };

  it('полное имя из Google', () => {
    expect(
      pickName({ ...base, name: '  Иван   Петров ', givenName: 'Иван' }),
    ).toBe('Иван Петров');
  });

  it('полное не проходит правила — имя без фамилии', () => {
    expect(pickName({ ...base, name: 'Иван 🚀', givenName: 'Иван' })).toBe(
      'Иван',
    );
  });

  it('имён нет — часть почты до @', () => {
    expect(pickName({ ...base })).toBe('ivan.petrov');
  });

  it('ничего не проходит — null', () => {
    expect(
      pickName({ sub: '1', email: 'asdfgh@gmail.com', name: 'qwerty' }),
    ).toBeNull();
  });

  it('длинное — обрезается до 40 знаков', () => {
    const long = 'Александр Владимирович Константинопольский';
    const got = pickName({ ...base, name: long });
    expect(got).not.toBeNull();
    expect(got!.length).toBeLessThanOrEqual(40);
    expect(long.startsWith(got!)).toBe(true);
  });
});
