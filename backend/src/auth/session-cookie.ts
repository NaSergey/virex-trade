import type { CookieOptions, Request, Response } from 'express';
import { useSecureCookie } from './cookie-security';

/**
 * Кука сессии — общая у площадки (`<домен>`) и журнала (`journal.<домен>`): вошёл
 * в одной части, значит, вошёл и в другой (спека 2026-11-03).
 *
 * Имя новое, а не прежнее с `Domain`: иначе на `admin.*` приходили бы две куки
 * `refresh_token`, и разбор брал бы первую. Вход админки свой и читает только свою.
 */
export const SESSION_COOKIE = 'tp_session';
export const LEGACY_COOKIE = 'refresh_token';

// '/', не '/auth': кука должна доехать и до страниц продукта — её на входе
// проверяет гейт фронтенда (`proxy.ts`), а не только сами /auth/* эндпоинты.
const COOKIE_PATH = '/';
// До смены пути кука ставилась на '/auth', и у всех, кто входил тогда, она
// осталась лежать в браузере рядом с новой. Браузер по RFC 6265 отдаёт первой
// ту, у которой путь длиннее, cookie-parser берёт первое значение — и на
// /auth/refresh уезжал мёртвый токен, из-за чего сессия рвалась на каждой
// перезагрузке. Сама по себе она не исчезнет: удалить куку можно только тем же
// путём, которым её ставили.
const OLD_COOKIE_PATH = '/auth';

const isAdminHost = (host: string | undefined) => /^admin\./i.test(host ?? '');

/**
 * Домен для `Domain` куки. Берётся из `FRONTEND_URL`, а не из запроса: от этого адреса
 * уже зависят CORS и `Secure`, а чужой Host не должен решать, на какой домен писать.
 * `undefined` — кука остаётся на своём адресе: localhost и IP браузер с `Domain` не примет.
 */
export function sharedDomain(
  host: string | undefined,
  frontendUrl: string | undefined = process.env.FRONTEND_URL,
): string | undefined {
  let base: string;
  try {
    base = new URL(frontendUrl ?? '').hostname.toLowerCase();
  } catch {
    return undefined;
  }
  if (!base.includes('.') || /^[\d.]+$/.test(base)) return undefined;
  const asked = host?.toLowerCase();
  return asked === base || asked === `journal.${base}` ? base : undefined;
}

/** Токен запроса. Старая кука читается, чтобы прежние сессии не обрывались при переезде. */
export function readSessionToken(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  if (isAdminHost(req.hostname)) return cookies?.[LEGACY_COOKIE];
  return cookies?.[SESSION_COOKIE] ?? cookies?.[LEGACY_COOKIE];
}

export function writeSessionCookie(
  req: Request,
  res: Response,
  token: string,
  maxAgeMs: number,
): void {
  const options: CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: useSecureCookie(),
    path: COOKIE_PATH,
    maxAge: maxAgeMs,
  };
  res.clearCookie(LEGACY_COOKIE, { path: OLD_COOKIE_PATH });
  if (isAdminHost(req.hostname)) {
    res.cookie(LEGACY_COOKIE, token, options);
    return;
  }
  res.clearCookie(LEGACY_COOKIE, { path: COOKIE_PATH });
  res.cookie(SESSION_COOKIE, token, {
    ...options,
    domain: sharedDomain(req.hostname),
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  res.clearCookie(LEGACY_COOKIE, { path: COOKIE_PATH });
  res.clearCookie(LEGACY_COOKIE, { path: OLD_COOKIE_PATH });
  if (isAdminHost(req.hostname)) return;
  res.clearCookie(SESSION_COOKIE, {
    path: COOKIE_PATH,
    domain: sharedDomain(req.hostname),
  });
}
