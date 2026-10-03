import { HttpException, Injectable, Logger } from '@nestjs/common';
import { BybitAuthService, BybitCredentials } from '../bybit/services/bybit-auth.service';
import { exchangeRejected, exchangeUnavailable } from './terminal-errors';
import { bybitFetch } from '../bybit/bybit-gate';

/** Дольше ждать ответа биржи незачем: экран терминала опрашивает её каждые три секунды. */
const TIMEOUT_MS = 10_000;
const RECV_WINDOW = '5000';

/**
 * Запросы терминала к Bybit v5: подпись, таймаут и один разбор ответа.
 *
 * Bybit отвечает 200 и на отказ — причина лежит в `retCode`. Здесь она
 * превращается в исключение с кодом, и вызывающий получает уже `result`:
 * забытая проверка `retCode` на торговом запросе означала бы «ордер принят»
 * там, где биржа его отклонила.
 *
 * `okCodes` — отказы, которые для вызывающего успех («плечо уже такое»,
 * «ордера уже нет»); для них возвращается null.
 */
@Injectable()
export class BybitTerminalClient extends BybitAuthService {
  private readonly logger = new Logger(BybitTerminalClient.name);

  /** Публичные рыночные данные — без ключей. */
  publicGet(path: string, params: Record<string, string>): Promise<any> {
    const query = new URLSearchParams(params).toString();
    return this.send(path, () => bybitFetch(`${this.baseUrl}${path}?${query}`, { signal: AbortSignal.timeout(TIMEOUT_MS) }));
  }

  privateGet(creds: BybitCredentials, path: string, params: Record<string, string>): Promise<any> {
    return this.send(path, () => {
      const timestamp = Date.now().toString();
      const query = this.buildQueryString({ ...params, recv_window: RECV_WINDOW, timestamp });
      const signature = this.createSignature(timestamp + creds.apiKey + RECV_WINDOW + query, creds.apiSecret);
      return bybitFetch(`${this.baseUrl}${path}?${query}`, {
        method: 'GET',
        headers: this.buildAuthHeaders(creds.apiKey, timestamp, signature, RECV_WINDOW),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    });
  }

  /**
   * Сколько раз ключ что-то менял на бирже — версия снимка счёта
   * (`StateCache`). Ключ API, а не секрет: подписать им ничего нельзя.
   */
  writeVersion(apiKey: string): number {
    return this.writes.get(apiKey) ?? 0;
  }

  private readonly writes = new Map<string, number>();

  /**
   * Когда ключ последний раз начал запись на биржу — время НАЧАЛА: событие
   * биржи о записи приходит после него, а ответ REST может прийти и позже
   * события. По нему `api` решает, видел ли поток счёта эту запись
   * (`stream/stream-state.ts`, `usable`).
   */
  lastWriteAt(apiKey: string): number | null {
    return this.writeStarts.get(apiKey) ?? null;
  }

  private readonly writeStarts = new Map<string, number>();

  /**
   * Каждая запись — ордер, правка, отмена, плечо — проходит здесь, поэтому
   * версия снимка сдвигается именно тут, а не в каждом методе терминала. И на
   * отказе тоже: сетка, отклонённая посреди, уже поставила часть ордеров.
   */
  privatePost(
    creds: BybitCredentials,
    path: string,
    body: Record<string, string | number | boolean>,
    okCodes: readonly number[] = [],
  ): Promise<any> {
    return this.write(creds.apiKey, () => this.post(creds, path, body, okCodes));
  }

  private async write<T>(apiKey: string, run: () => Promise<T>): Promise<T> {
    this.writeStarts.set(apiKey, Date.now());
    try {
      return await run();
    } finally {
      this.writes.set(apiKey, this.writeVersion(apiKey) + 1);
    }
  }

  private post(
    creds: BybitCredentials,
    path: string,
    body: Record<string, string | number | boolean>,
    okCodes: readonly number[],
  ): Promise<any> {
    return this.send(
      path,
      () => {
        const timestamp = Date.now().toString();
        const raw = JSON.stringify(body);
        const signature = this.createSignature(timestamp + creds.apiKey + RECV_WINDOW + raw, creds.apiSecret);
        return bybitFetch(`${this.baseUrl}${path}`, {
          method: 'POST',
          headers: this.buildAuthHeaders(creds.apiKey, timestamp, signature, RECV_WINDOW),
          body: raw,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      },
      okCodes,
    );
  }

  private async send(path: string, request: () => Promise<Response>, okCodes: readonly number[] = []): Promise<any> {
    let data: any;
    try {
      const response = await request();
      data = await response.json();
    } catch (e) {
      if (e instanceof HttpException) throw e;
      // Ключей и подписи в сообщении нет — только путь и причина сети.
      this.logger.warn(`${path}: ${e instanceof Error ? e.message : e}`);
      throw exchangeUnavailable();
    }
    // Ответ без числового retCode — не ответ Bybit (страница прокси, обрыв):
    // `Number(null)` дал бы 0, то есть «успех» на пустом месте.
    if (typeof data?.retCode !== 'number') throw exchangeUnavailable();
    const retCode: number = data.retCode;
    if (retCode === 0) return data.result ?? {};
    if (okCodes.includes(retCode)) return null;
    this.logger.warn(`${path}: retCode ${data?.retCode} — ${data?.retMsg}`);
    throw exchangeRejected(retCode, String(data?.retMsg ?? ''));
  }
}
