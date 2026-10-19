import { ExchangeId } from './exchange.types';

/**
 * What the UI needs to render an exchange without knowing anything about it:
 * its name, whether the connect form needs a third secret, and where the user
 * goes to create the key.
 *
 * The catalog is the single list of supported exchanges. Adding one means an
 * entry here plus an adapter registered in ExchangeRegistry — nothing else in
 * the app enumerates exchanges.
 */
export interface ExchangeMeta {
  id: ExchangeId;
  label: string;
  /** OKX, Bitget and KuCoin issue a passphrase alongside the key/secret. */
  needsPassphrase: boolean;
  /** Permissions the key needs, shown on the connect form. */
  permissionsHint: string;
}

export const EXCHANGE_CATALOG: readonly ExchangeMeta[] = [
  {
    id: 'bybit',
    label: 'Bybit',
    needsPassphrase: false,
    permissionsHint: 'Права на чтение и торговлю (Contract Trade), без права на вывод средств.',
  },
  {
    // Demo Trading Bybit: свой адрес и свои ключи, деньги ненастоящие
    // (`bybitBase`, `BYBIT_DEMO_API`). Отдельная биржа, а не флажок у Bybit
    // (владелец 2026-10-19): можно держать оба ключа и переключаться.
    id: 'bybit-demo',
    label: 'Bybit Demo',
    needsPassphrase: false,
    permissionsHint:
      'Ключ демо-счёта: на Bybit переключитесь на Demo Trading и создайте ключ там (аватар → API). Права на чтение и торговлю (Contract Trade).',
  },
  {
    id: 'okx',
    label: 'OKX',
    needsPassphrase: true,
    permissionsHint:
      'Права «Читать» и «Торговля», без «Вывод средств». Passphrase задаётся вами при создании ключа — восстановить его потом нельзя.',
  },
  {
    id: 'bitget',
    label: 'Bitget',
    needsPassphrase: true,
    permissionsHint:
      'Права «Только чтение» и «Трейдинг» для фьючерсов, без вывода средств. Passphrase задаётся вами при создании ключа.',
  },
  {
    id: 'kucoin',
    label: 'KuCoin Futures',
    needsPassphrase: true,
    permissionsHint:
      'Ключ KuCoin Futures с правами General и Futures Trading, без вывода средств. Passphrase задаётся вами при создании ключа.',
  },
  {
    id: 'gate',
    label: 'Gate.io',
    needsPassphrase: false,
    permissionsHint:
      'APIv4-ключ с доступом к Perpetual Futures на чтение и торговлю, без вывода средств.',
  },
  {
    id: 'binance',
    label: 'Binance Futures',
    needsPassphrase: false,
    permissionsHint:
      'Ключ с правом «Enable Futures» на чтение и торговлю, без вывода средств. Если у ключа включён IP-whitelist, добавьте в него адрес сервера.',
  },
  {
    id: 'mexc',
    label: 'MEXC Futures',
    needsPassphrase: false,
    permissionsHint:
      'Ключ с доступом к фьючерсам на чтение и торговлю, без вывода средств. MEXC ограничивает фьючерсный API на части аккаунтов — если ключ не принимается, доступ нужно запросить в поддержке.',
  },
];

export const isExchangeId = (v: unknown): v is ExchangeId =>
  typeof v === 'string' && EXCHANGE_CATALOG.some((e) => e.id === v);

export const exchangeMeta = (id: ExchangeId): ExchangeMeta =>
  EXCHANGE_CATALOG.find((e) => e.id === id) as ExchangeMeta;

/**
 * Bybit — настоящий или демо-счёт: у обоих один торговый слой, терминал и
 * шлюз лимита IP. Различаются только адресом запросов с ключом.
 */
export const isBybit = (id: ExchangeId | null | undefined): id is 'bybit' | 'bybit-demo' =>
  id === 'bybit' || id === 'bybit-demo';
