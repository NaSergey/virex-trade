import { BybitApiKeyService } from './bybit-api-key.service';
import { BybitCredentials } from './bybit-auth.service';

/**
 * Connect refuses keys that can trade or withdraw, so the reading of Bybit's
 * permission payload is the whole safety check — a false "read-only" here
 * stores exactly the key the rule exists to keep out.
 *
 * The payloads below are shaped like Bybit's `GET /v5/user/query-api`: every
 * group is always present, and an unused one is an empty array rather than
 * missing.
 */

const CREDS: BybitCredentials = { apiKey: 'test-key', apiSecret: 'test-secret' };

const READ_ONLY_PERMS = {
  ContractTrade: [],
  Spot: [],
  Wallet: [],
  Options: [],
  Derivatives: [],
  CopyTrading: [],
  BlockTrade: [],
  Exchange: ['ExchangeHistory'],
  NFT: [],
  Affiliate: [],
};

function stubFetch(body: unknown) {
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  })) as unknown as typeof fetch;
}

const ok = (permissions: Record<string, string[]>, readOnly = 0) => ({
  retCode: 0,
  retMsg: 'OK',
  result: { apiKey: 'test-key', readOnly, permissions },
});

describe('BybitApiKeyService', () => {
  const realFetch = globalThis.fetch;
  let service: BybitApiKeyService;

  beforeEach(() => {
    service = new BybitApiKeyService();
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  it('reads a read-only key as neither trading nor withdrawing', async () => {
    stubFetch(ok(READ_ONLY_PERMS));

    const info = await service.getApiKeyInfo(CREDS);

    expect(info).toEqual({ success: true, canTrade: false, canWithdraw: false });
  });

  it('reads history rights alone as read-only', async () => {
    // The one group a journal actually needs must never look like trading,
    // or every valid key would be refused.
    stubFetch(ok({ ...READ_ONLY_PERMS, Exchange: ['ExchangeHistory'] }));

    expect((await service.getApiKeyInfo(CREDS)).canTrade).toBe(false);
  });

  it('flags derivatives order rights as trading', async () => {
    stubFetch(ok({ ...READ_ONLY_PERMS, ContractTrade: ['Order', 'Position'] }));

    expect((await service.getApiKeyInfo(CREDS)).canTrade).toBe(true);
  });

  it('flags spot trading as trading', async () => {
    stubFetch(ok({ ...READ_ONLY_PERMS, Spot: ['SpotTrade'] }));

    expect((await service.getApiKeyInfo(CREDS)).canTrade).toBe(true);
  });

  it('treats an unknown permission group as trading rather than safe', async () => {
    // A group Bybit adds later must fail closed: guessing it harmless would
    // silently widen what connect accepts.
    stubFetch(ok({ ...READ_ONLY_PERMS, SomethingNew: ['Whatever'] }));

    expect((await service.getApiKeyInfo(CREDS)).canTrade).toBe(true);
  });

  it('flags withdrawal rights', async () => {
    stubFetch(ok({ ...READ_ONLY_PERMS, Wallet: ['Withdraw'] }));

    expect((await service.getApiKeyInfo(CREDS)).canWithdraw).toBe(true);
  });

  it('does not treat internal transfers as withdrawal', async () => {
    // AccountTransfer moves money between the user's own account types and
    // cannot take it off the platform.
    stubFetch(ok({ ...READ_ONLY_PERMS, Wallet: ['AccountTransfer', 'SubMemberTransfer'] }));

    const info = await service.getApiKeyInfo(CREDS);

    expect(info.canWithdraw).toBe(false);
    expect(info.canTrade).toBe(false);
  });

  it('reports failure instead of a permissive answer when Bybit rejects the call', async () => {
    // A key that cannot be interrogated is unknown, not safe — success:false
    // is what stops the caller from reading canTrade:false as a clean bill.
    stubFetch({ retCode: 10003, retMsg: 'API key is invalid' });

    const info = await service.getApiKeyInfo(CREDS);

    expect(info.success).toBe(false);
    expect(info.error).toBe('API key is invalid');
  });

  it('reports failure when keys are missing rather than calling out', async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ok(READ_ONLY_PERMS) };
    }) as unknown as typeof fetch;

    const info = await service.getApiKeyInfo({ apiKey: '', apiSecret: '' });

    expect(info.success).toBe(false);
    expect(called).toBe(false);
  });
});
