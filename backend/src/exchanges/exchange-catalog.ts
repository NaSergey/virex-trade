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
];

export const isExchangeId = (v: unknown): v is ExchangeId =>
  typeof v === 'string' && EXCHANGE_CATALOG.some((e) => e.id === v);

export const exchangeMeta = (id: ExchangeId): ExchangeMeta =>
  EXCHANGE_CATALOG.find((e) => e.id === id) as ExchangeMeta;
