import type { BybitCredentials } from '../bybit/services/bybit-auth.service';
import type { BybitTerminalClient } from './bybit-terminal.client';
import type { AccountSnapshot } from './stream/stream-state';

/** Страниц открытых ордеров за один снимок: двести ордеров — больше, чем ставят руками. */
const ORDER_PAGES = 4;

/**
 * Снимок счёта через REST — три запроса: кошелёк, позиции USDT-перпов и
 * открытые ордера. Один на REST-путь экрана (`TerminalService.readState`) и
 * на начало потока (`TerminalStreamService`): снимка при подписке Bybit не
 * присылает.
 */
export async function readAccount(bybit: BybitTerminalClient, creds: BybitCredentials): Promise<AccountSnapshot> {
  const [wallet, positions, orders] = await Promise.all([
    bybit.privateGet(creds, '/account/wallet-balance', { accountType: 'UNIFIED' }),
    bybit.privateGet(creds, '/position/list', { category: 'linear', settleCoin: 'USDT', limit: '200' }),
    openOrderRows(bybit, creds),
  ]);
  return { account: wallet.list?.[0] ?? null, positions: positions.list ?? [], orders };
}

async function openOrderRows(bybit: BybitTerminalClient, creds: BybitCredentials): Promise<any[]> {
  const rows: any[] = [];
  let cursor = '';
  for (let page = 0; page < ORDER_PAGES; page++) {
    const params: Record<string, string> = { category: 'linear', settleCoin: 'USDT', limit: '50' };
    if (cursor) params.cursor = cursor;
    const result = await bybit.privateGet(creds, '/order/realtime', params);
    rows.push(...(result.list ?? []));
    cursor = result.nextPageCursor || '';
    if (!cursor) break;
  }
  return rows;
}
