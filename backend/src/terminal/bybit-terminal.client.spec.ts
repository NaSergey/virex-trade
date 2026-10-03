import { HttpException } from '@nestjs/common';
import { BybitTerminalClient } from './bybit-terminal.client';

/**
 * Версия снимка счёта (`writeVersion`) — то, по чему `StateCache` терминала
 * понимает, что показанный счёт устарел. Сдвигает её каждая запись, и
 * отклонённая тоже: сетка, оборванная отказом посреди, уже поставила часть
 * ордеров.
 */
const CREDS = { apiKey: 'key-1', apiSecret: 'secret' };

// Новый ответ на каждый вызов: тело Response читается один раз.
const respond = (body: unknown) =>
  jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 }));

afterEach(() => jest.restoreAllMocks());

describe('BybitTerminalClient.writeVersion', () => {
  it('принятая запись сдвигает версию ключа', async () => {
    const client = new BybitTerminalClient();
    respond({ retCode: 0, result: { orderId: 'o1' } });

    expect(client.writeVersion(CREDS.apiKey)).toBe(0);
    await client.privatePost(CREDS, '/order/create', { symbol: 'BTCUSDT' });
    expect(client.writeVersion(CREDS.apiKey)).toBe(1);
  });

  it('отклонённая запись тоже сдвигает версию', async () => {
    const client = new BybitTerminalClient();
    respond({ retCode: 110007, retMsg: 'insufficient balance' });

    await expect(client.privatePost(CREDS, '/order/create', {})).rejects.toBeInstanceOf(HttpException);
    expect(client.writeVersion(CREDS.apiKey)).toBe(1);
  });

  it('чтение версию не сдвигает, и ключи не делят её', async () => {
    const client = new BybitTerminalClient();
    respond({ retCode: 0, result: { list: [] } });

    await client.privateGet(CREDS, '/position/list', {});
    expect(client.writeVersion(CREDS.apiKey)).toBe(0);

    await client.privatePost(CREDS, '/order/cancel', {});
    expect(client.writeVersion('другой ключ')).toBe(0);
  });
});

describe('BybitTerminalClient.lastWriteAt', () => {
  it('помнит НАЧАЛО записи ключа — и принятой, и отклонённой; чтение его не трогает', async () => {
    const client = new BybitTerminalClient();
    respond({ retCode: 110007, retMsg: 'insufficient balance' });
    expect(client.lastWriteAt(CREDS.apiKey)).toBeNull();

    const before = Date.now();
    await expect(client.privatePost(CREDS, '/order/create', {})).rejects.toBeInstanceOf(HttpException);
    const at = client.lastWriteAt(CREDS.apiKey);
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());

    await client.privateGet(CREDS, '/position/list', {}).catch(() => undefined);
    expect(client.lastWriteAt(CREDS.apiKey)).toBe(at);
    expect(client.lastWriteAt('другой')).toBeNull();
  });
});
