import { API_BASE_URL } from '@/shared/config/api';
import { tokenStore } from '@/shared/lib/tokenStore';

// Called when the session can no longer be refreshed (refresh token gone/expired).
// AuthProvider registers a handler that clears the user and redirects to /login.
let onUnauthenticated: (() => void) | null = null;
export function setUnauthenticatedHandler(fn: (() => void) | null): void {
  onUnauthenticated = fn;
}

// Single-flight refresh: many parallel 401s should trigger only one /auth/refresh.
let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) {
          tokenStore.set(null);
          return null;
        }
        const data = await res.json();
        const token: string | null = data?.accessToken ?? null;
        tokenStore.set(token);
        return token;
      } catch {
        tokenStore.set(null);
        return null;
      }
    })();
    void refreshPromise.finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// Authenticated fetch: attaches the access token, sends cookies, and on a 401
// transparently refreshes the access token once and retries.
export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const doFetch = (token: string | null): Promise<Response> => {
    const headers = new Headers(options.headers ?? {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  };

  let res = await doFetch(tokenStore.get());

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await doFetch(newToken);
    }
    if (res.status === 401) {
      onUnauthenticated?.();
    }
  }

  return res;
}

// Текущий перевод ошибок API. LocaleProvider вызывает setErrorMessages при
// каждой смене языка — тот же приём, что setUnauthenticatedHandler выше:
// модуль вне React, но должен реагировать на локаль без прокидывания её
// через каждый вызов apiFetch/apiJson.
let errorMessages: Record<string, string> = {};

export function setErrorMessages(messages: Record<string, string>): void {
  errorMessages = messages;
}

interface ApiErrorBody {
  code?: string;
  message?: string | string[];
  error?: string;
  /**
   * Именованные значения для подстановки в переведённый шаблон (`{label}` и
   * т.п.) — для ошибок, где `message` с бэкенда несёт не только текст, но и
   * конкретику (какая биржа, что именно запрещено). Без параметров перевод по
   * `code` откатывал бы эту конкретику до общей фразы даже на языке бэкенда.
   */
  params?: Record<string, string>;
}

/** Подставляет `{key}` из params; ключ без значения — пустая строка, а не «[object]». */
function interpolate(template: string, params?: Record<string, string>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? '');
}

/**
 * Переводит ошибку API в текст текущего языка: по `code`, если для него
 * есть перевод в каталоге текущей локали (с подстановкой `params`, если они
 * есть). Иначе — сырой `message`/`error` с бэкенда как раньше (обычно
 * по-русски, пока код не заведён на этом эндпоинте — так ведут себя все ещё
 * не мигрированные на code эндпоинты). Если нет вообще ничего — `fallback`,
 * а если и его не передали, то `errors.generic` из текущего каталога.
 */
export function resolveApiError(body: ApiErrorBody, fallback?: string): string {
  if (body.code && errorMessages[body.code]) return interpolate(errorMessages[body.code], body.params);
  const raw = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  if (raw) return raw;
  if (body.error) return body.error;
  return fallback ?? errorMessages.generic ?? 'Error';
}

/**
 * Запрос с разбором JSON и единой ошибкой. Раньше пара «проверить res.ok →
 * res.json()» была скопирована в каждый queryFn, причём в трёх слегка разных
 * вариантах (где-то ещё и `success: false` из тела); теперь одна реализация.
 * @param path - путь относительно API_BASE_URL
 * @param options - как у fetch
 */
export async function apiJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(path, options);
  const data = await res.json().catch(() => ({}));
  const body = data as { success?: boolean } & ApiErrorBody;
  if (!res.ok || body.success === false) {
    throw new Error(resolveApiError(body, `HTTP error! status: ${res.status}`));
  }
  return data as T;
}

type QueryValue = string | number | boolean | string[] | number[] | null | undefined;

/**
 * Собирает query-строку («?a=1&b=2» либо пустую), пропуская пустые значения:
 * undefined, null, '' и пустой массив. Ноль НЕ пустой — `hourFrom=0` это
 * валидная полночь; «всё время» (days=0) вызывающий гасит сам, передав
 * undefined. Массивы уходят через запятую — так их ждёт бэкенд.
 * @param params - пары «параметр → значение»
 */
export function qs(params: Record<string, QueryValue>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      q.set(key, value.join(','));
    } else {
      q.set(key, String(value));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}
