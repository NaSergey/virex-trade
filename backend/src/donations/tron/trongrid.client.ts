import { Inject, Injectable, Logger } from '@nestjs/common';
import { DONATION_CONFIG, DonationConfig } from '../donation.config';

/** Один Transfer-лог TRC20, приведённый к нашим типам. */
export interface Trc20Transfer {
  txId: string;
  from: string;
  to: string;
  contract: string;
  valueUnits: bigint;
  /** block_timestamp в миллисекундах. */
  blockTimestamp: number;
  tokenSymbol: string | null;
  tokenDecimals: number | null;
  raw: unknown;
}

export interface Trc20Page {
  transfers: Trc20Transfer[];
  /** Курсор следующей страницы TronGrid; null — страниц больше нет. */
  nextFingerprint: string | null;
}

interface TronGridTrc20Row {
  transaction_id?: string;
  from?: string;
  to?: string;
  type?: string;
  value?: string;
  block_timestamp?: number;
  token_info?: { symbol?: string; address?: string; decimals?: number };
}

interface TronGridTrc20Response {
  data?: TronGridTrc20Row[];
  success?: boolean;
  error?: string;
  meta?: {
    fingerprint?: string;
    page_size?: number;
    links?: { next?: string };
  };
}

const REQUEST_TIMEOUT_MS = 15_000;

export class TronGridError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'TronGridError';
  }
}

/**
 * Тонкий клиент TronGrid — публичного HTTP-API полной ноды TRON, которое
 * держит сам TRON Foundation.
 *
 * Используется ровно один эндпоинт:
 *
 *   GET /v1/accounts/{address}/transactions/trc20
 *       ?only_to=true              — только входящие на наш кошелёк
 *       &only_confirmed=true       — только транзакции в подтверждённых
 *                                    (solidified) блоках; см. ниже
 *       &contract_address=<USDT>   — только переводы нужного токена
 *       &min_timestamp=<ms>        — с какого момента смотреть
 *       &order_by=block_timestamp,asc
 *       &limit=<=200
 *       &fingerprint=<курсор>      — следующая страница
 *
 * Ответ: `{ data: [ { transaction_id, from, to, type, value, block_timestamp,
 * token_info: { symbol, address, decimals } } ], meta: { fingerprint } }`.
 * `value` — строка в минимальных единицах токена, поэтому парсится в BigInt
 * без промежуточного числа.
 *
 * Ограничения, которые важно знать:
 *  - `only_confirmed=true` и есть проверка финальности. В TRON (DPoS) блок
 *    становится необратимым, когда его подтвердят 2/3 суперпредставителей —
 *    примерно 19 блоков, около минуты. Считать подтверждения вручную здесь
 *    нечего: solidified-блок откатить нельзя, и это строже любого выбранного
 *    наугад числа подтверждений.
 *  - без ключа TronGrid режет по IP (порядка нескольких запросов в секунду);
 *    ключ в заголовке `TRON-PRO-API-KEY` поднимает лимит и даёт понятную
 *    квоту. Один опрос раз в 15 секунд укладывается и без ключа, но на
 *    продакшене ключ стоит завести — он бесплатный.
 *  - листание идёт `fingerprint`-курсором, а не offset'ом: смещение на этом
 *    эндпоинте ограничено, и глубокая история через него недоступна.
 */
@Injectable()
export class TronGridClient {
  private readonly logger = new Logger(TronGridClient.name);

  constructor(
    @Inject(DONATION_CONFIG) private readonly config: DonationConfig,
  ) {}

  async fetchIncomingUsdt(params: {
    minTimestampMs: number;
    limit?: number;
    fingerprint?: string | null;
  }): Promise<Trc20Page> {
    const query = new URLSearchParams({
      only_to: 'true',
      only_confirmed: 'true',
      contract_address: this.config.usdtContract,
      min_timestamp: String(Math.floor(params.minTimestampMs)),
      order_by: 'block_timestamp,asc',
      limit: String(Math.min(params.limit ?? 200, 200)),
    });
    if (params.fingerprint) query.set('fingerprint', params.fingerprint);

    const url =
      `${this.config.apiUrl}/v1/accounts/${this.config.receivingAddress}` +
      `/transactions/trc20?${query.toString()}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: this.config.apiKey
          ? { 'TRON-PRO-API-KEY': this.config.apiKey }
          : {},
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      throw new TronGridError(`сеть недоступна: ${e}`);
    }

    if (!res.ok) {
      // 429 здесь — не исключительная ситуация, а обычный ответ публичного
      // API. Вызывающий отступает и приходит позже; курсор при этом не
      // двигается, поэтому ничего не теряется.
      throw new TronGridError(`HTTP ${res.status}`, res.status);
    }

    const body = (await res
      .json()
      .catch(() => null)) as TronGridTrc20Response | null;
    if (!body || body.success === false) {
      throw new TronGridError(body?.error ?? 'некорректный ответ TronGrid');
    }

    const transfers = (body.data ?? [])
      .map((row) => this.toTransfer(row))
      .filter((t): t is Trc20Transfer => t !== null);

    return { transfers, nextFingerprint: body.meta?.fingerprint ?? null };
  }

  /**
   * Фильтры запроса продублированы проверками ответа. Это не паранойя: набор
   * параметров у публичного API может измениться, опечатка в имени параметра
   * не вызывает ошибки — он просто игнорируется, — и тогда в обработку
   * поехали бы исходящие переводы или чужой токен. Цена проверки нулевая,
   * цена ошибки — засчитанный чужой платёж.
   */
  private toTransfer(row: TronGridTrc20Row): Trc20Transfer | null {
    if (row.type !== 'Transfer') return null;
    if (!row.transaction_id || !row.from || !row.to || row.value == null)
      return null;
    if (row.to !== this.config.receivingAddress) return null;
    if (row.token_info?.address !== this.config.usdtContract) return null;
    if (typeof row.block_timestamp !== 'number') return null;

    let valueUnits: bigint;
    try {
      valueUnits = BigInt(row.value);
    } catch {
      this.logger.warn(`нечисловое value в ответе TronGrid: ${row.value}`);
      return null;
    }
    if (valueUnits <= 0n) return null;

    return {
      txId: row.transaction_id,
      from: row.from,
      to: row.to,
      contract: row.token_info.address,
      valueUnits,
      blockTimestamp: row.block_timestamp,
      tokenSymbol: row.token_info?.symbol ?? null,
      tokenDecimals: row.token_info?.decimals ?? null,
      raw: row,
    };
  }
}
