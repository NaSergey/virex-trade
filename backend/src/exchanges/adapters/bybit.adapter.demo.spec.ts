import { BybitAdapter, BybitDemoAdapter } from './bybit.adapter';
import { ExchangeCredentials } from '../exchange.types';

/**
 * Ключ демо-счёта существует только на демо-адресе Bybit. При подключении он
 * приходит сырым из формы, без признака, — поэтому признак ставит сам
 * адаптер биржи `bybit-demo`, а не только хранилище ключей.
 */

const RAW: ExchangeCredentials = { apiKey: 'k', apiSecret: 's' };
const RANGE = { startMs: 1_700_000_000_000, endMs: 1_700_000_100_000 };

function build<T extends BybitAdapter>(Ctor: new (...args: any[]) => T) {
  const balance = { getUSDTBalance: jest.fn().mockResolvedValue({ success: true, balance: 1 }) };
  const positions = { getOpenPositions: jest.fn().mockResolvedValue({ success: true, positions: [] }) };
  const trades = {
    fetchClosedPnlPage: jest.fn().mockResolvedValue({ success: true, list: [] }),
    fetchExecutionsPage: jest.fn().mockResolvedValue({ success: true, list: [] }),
  };
  const apiKeys = { getApiKeyInfo: jest.fn().mockResolvedValue({ success: true, canTrade: true, canWithdraw: false }) };
  const adapter = new Ctor(balance, positions, trades, apiKeys);
  const sent = () => [
    balance.getUSDTBalance.mock.calls[0]?.[0],
    apiKeys.getApiKeyInfo.mock.calls[0]?.[0],
    positions.getOpenPositions.mock.calls[0]?.[0],
    trades.fetchClosedPnlPage.mock.calls[0]?.[0],
    trades.fetchExecutionsPage.mock.calls[0]?.[0],
  ];
  return { adapter, sent };
}

async function callAll(adapter: BybitAdapter) {
  await adapter.verifyCredentials(RAW);
  await adapter.getOpenPositions(RAW);
  await adapter.fetchClosedTrades(RAW, RANGE);
  await adapter.fetchFills(RAW, RANGE);
}

describe('BybitDemoAdapter', () => {
  it('своя биржа в каталоге', () => {
    expect(build(BybitDemoAdapter).adapter.id).toBe('bybit-demo');
    expect(build(BybitAdapter).adapter.id).toBe('bybit');
  });

  it('каждый запрос с ключом получает признак демо — и проверка сырого ключа при подключении тоже', async () => {
    const { adapter, sent } = build(BybitDemoAdapter);
    await callAll(adapter);
    for (const creds of sent()) expect(creds).toEqual({ apiKey: 'k', apiSecret: 's', demo: true });
    // Переданное не мутируется: тот же объект мог уйти и в другой путь.
    expect(RAW.demo).toBeUndefined();
  });

  it('настоящий Bybit признака не ставит', async () => {
    const { adapter, sent } = build(BybitAdapter);
    await callAll(adapter);
    for (const creds of sent()) expect(creds).toBe(RAW);
  });
});
