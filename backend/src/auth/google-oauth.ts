import { createHash, randomBytes } from 'crypto';
import { isReadableName } from './identity-rules';

/**
 * Вход через Google — Authorization Code с PKCE, целиком на сервере (спека
 * `docs/superpowers/specs/2026-11-05-google-auth-design.md`). Здесь — чистые
 * части: адреса, состояние входа в куке, разбор `id_token`, выбор имени.
 * Маршруты — `AuthController`, аккаунт — `AuthService.signInWithGoogle`.
 */

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

/** Кука с состоянием входа: живёт от ухода на Google до колбэка. */
export const OAUTH_COOKIE = 'tp_oauth';
export const OAUTH_COOKIE_PATH = '/auth/google';
export const OAUTH_TTL_MS = 10 * 60_000;

/** `next` и `ref` едут в куке — длинные значения отбрасываются, а не режутся. */
const MAX_NEXT = 512;
const MAX_REF = 64;
const MAX_NAME = 40;

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

/** Нет любой переменной — вход через Google выключен, остальное работает. */
export function googleConfig(
  env: Record<string, string | undefined> = process.env,
): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * Origin части, куда пришёл запрос: `FRONTEND_URL` или он же с `journal.` перед
 * хостом. Из Host берётся только признак «журнал» — сам адрес собирается из
 * `FRONTEND_URL`, поэтому чужой Host не попадёт ни в `redirect_uri`, ни в адрес
 * возврата.
 */
export function partOrigin(
  host: string | undefined,
  frontendUrl: string | undefined = process.env.FRONTEND_URL,
): string | null {
  let url: URL;
  try {
    url = new URL(frontendUrl ?? '');
  } catch {
    return null;
  }
  const journal = `journal.${url.hostname.toLowerCase()}`;
  if ((host ?? '').toLowerCase() === journal) url.hostname = journal;
  return url.origin;
}

export const callbackUrl = (origin: string) => `${origin}/auth/google/callback`;

/**
 * Куда вернуть после входа — то же правило, что `safeNext` на фронте: путь,
 * который при разборе от origin остаётся на нём. `/\evil.example` и
 * `//evil.example` браузер увёл бы на чужой сайт.
 */
export function safeNextPath(raw: unknown, origin: string): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.length > MAX_NEXT)
    return '/';
  try {
    return new URL(raw, origin).origin === origin ? raw : '/';
  } catch {
    return '/';
  }
}

export const safeRef = (raw: unknown): string | undefined =>
  typeof raw === 'string' && raw.length > 0 && raw.length <= MAX_REF
    ? raw
    : undefined;

export interface OAuthState {
  /** Сверяется с `state` колбэка: без куки с ним колбэк отказывает (подделка входа). */
  state: string;
  /** PKCE: Google обменяет код только вместе с ним. */
  verifier: string;
  next: string;
  ref?: string;
}

export function newOAuthState(next: string, ref?: string): OAuthState {
  return {
    state: randomBytes(16).toString('base64url'),
    verifier: randomBytes(32).toString('base64url'),
    next,
    ...(ref ? { ref } : {}),
  };
}

export const encodeState = (st: OAuthState) =>
  Buffer.from(JSON.stringify(st)).toString('base64url');

export function decodeState(raw: unknown): OAuthState | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const v = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as Partial<OAuthState>;
    if (
      typeof v.state !== 'string' ||
      typeof v.verifier !== 'string' ||
      typeof v.next !== 'string'
    )
      return null;
    return {
      state: v.state,
      verifier: v.verifier,
      next: v.next,
      ...(typeof v.ref === 'string' ? { ref: v.ref } : {}),
    };
  } catch {
    return null;
  }
}

export function authorizeUrl(
  cfg: GoogleConfig,
  redirectUri: string,
  st: OAuthState,
): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: st.state,
    code_challenge: createHash('sha256')
      .update(st.verifier)
      .digest('base64url'),
    code_challenge_method: 'S256',
    // Без него вошедший в браузере в один аккаунт Google не выбрал бы другой.
    prompt: 'select_account',
  });
  return `${AUTHORIZE_URL}?${q.toString()}`;
}

/** Код → `id_token`. Повторов нет: код одноразовый, второй обмен Google отклонит. */
export async function exchangeCode(
  cfg: GoogleConfig,
  code: string,
  redirectUri: string,
  verifier: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    id_token?: unknown;
    error?: unknown;
  };
  if (!res.ok)
    throw new Error(
      `Google отклонил обмен кода: ${res.status} ${String(body.error ?? '')}`,
    );
  if (typeof body.id_token !== 'string')
    throw new Error('Google не вернул id_token');
  return body.id_token;
}

export interface GoogleClaims {
  /** Постоянный id аккаунта Google. */
  sub: string;
  /** Подтверждённая Google почта, в нижнем регистре. */
  email: string;
  name?: string;
  givenName?: string;
}

/**
 * Разбор `id_token`. **Подпись не проверяется:** токен получен сервером
 * напрямую от token-эндпоинта Google по TLS, и OIDC Core 3.1.3.7 разрешает в
 * этом случае полагаться на TLS. Поэтому звать только с токеном из
 * `exchangeCode`, а не с присланным браузером.
 */
export function claimsFromIdToken(
  idToken: unknown,
  clientId: string,
  now = Date.now(),
): GoogleClaims {
  if (typeof idToken !== 'string') throw new Error('id_token не строка');
  const part = idToken.split('.')[1];
  if (!part) throw new Error('id_token не JWT');
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    throw new Error('id_token не разбирается');
  }

  if (typeof p.iss !== 'string' || !ISSUERS.has(p.iss))
    throw new Error(`чужой iss: ${String(p.iss)}`);
  const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
  if (!aud.includes(clientId)) throw new Error('id_token выдан не нам');
  if (typeof p.exp !== 'number' || p.exp * 1000 <= now)
    throw new Error('id_token истёк');
  // Строго `true`: неподтверждённая почта могла быть вписана кем угодно, а по
  // ней аккаунт привязывается к существующему.
  if (p.email_verified !== true)
    throw new Error('почта не подтверждена Google');
  if (typeof p.sub !== 'string' || !p.sub) throw new Error('нет sub');
  if (typeof p.email !== 'string' || !p.email.includes('@'))
    throw new Error('нет почты');

  return {
    sub: p.sub,
    email: p.email.trim().toLowerCase(),
    ...(typeof p.name === 'string' ? { name: p.name } : {}),
    ...(typeof p.given_name === 'string' ? { givenName: p.given_name } : {}),
  };
}

/**
 * Имя нового аккаунта: полное из Google, иначе имя без фамилии, иначе часть
 * почты до `@` — первое, что проходит правила регистрации. Не прошло ничего —
 * null: имя можно задать в настройках профиля.
 */
export function pickName(claims: GoogleClaims): string | null {
  const candidates = [
    claims.name,
    claims.givenName,
    claims.email.split('@')[0],
  ];
  for (const raw of candidates) {
    const name = (raw ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_NAME)
      .trim();
    if (name.length >= 2 && isReadableName(name)) return name;
  }
  return null;
}
