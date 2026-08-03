import * as crypto from 'crypto';

/**
 * Shared plumbing for the REST adapters: signing primitives and a JSON GET that
 * never throws.
 *
 * Adapters return `{ success: false, error }` rather than raising, because the
 * sync loop treats an unreachable exchange as "nothing new this tick" and
 * retries — an exception there would abort the rest of a user's sync.
 */

export type HmacEncoding = 'hex' | 'base64';

export const hmac = (
  algo: 'sha256' | 'sha512',
  secret: string,
  message: string,
  encoding: HmacEncoding,
): string => crypto.createHmac(algo, secret).update(message).digest(encoding);

export const sha512Hex = (body: string): string =>
  crypto.createHash('sha512').update(body).digest('hex');

/** Query string in caller-given order; exchanges sign exactly what is sent. */
export const queryString = (params: Record<string, string | number | undefined>): string =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

export interface JsonResponse {
  ok: boolean;
  status: number;
  body: any;
  error?: string;
}

export async function getJson(url: string, headers: Record<string, string>): Promise<JsonResponse> {
  try {
    const res = await fetch(url, { method: 'GET', headers });
    // Exchanges answer errors with a JSON envelope and a 200 as often as with a
    // 4xx, so the body is parsed either way and the caller decides.
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, status: res.status, body, error: `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, body };
  } catch (e: any) {
    return { ok: false, status: 0, body: null, error: e?.message ?? 'network error' };
  }
}

/** Exchanges send numbers as strings and '' for "not applicable". */
export function num(v: unknown): number {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

/** Keep the exchange's own decimal string, collapsing '' and null to absent. */
export function str(v: unknown): string | undefined {
  return v != null && v !== '' ? String(v) : undefined;
}
