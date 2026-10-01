import { SettingsController } from './settings.controller';
import { ExchangeAdapter, KeyPermissions } from '../exchanges/exchange.types';

/**
 * Connect takes a key whatever it is allowed to do, and the page shows those
 * rights instead. These tests hold both halves: nothing is refused over
 * permissions, and "the exchange did not say" never comes back as read-only.
 */

const KEYS = { apiKey: 'key-1234567890', apiSecret: 'secret' };

function setup(adapter: Partial<ExchangeAdapter>, stored: typeof KEYS | null = KEYS) {
  const credentials = {
    save: jest.fn().mockResolvedValue(undefined),
    invalidate: jest.fn(),
    maskKey: jest.fn().mockReturnValue('key-••••'),
    activeExchange: jest.fn().mockResolvedValue('bybit'),
    get: jest.fn().mockResolvedValue(stored),
  };
  const exchanges = { get: jest.fn().mockReturnValue(adapter) };
  const positionsCache = { invalidate: jest.fn() };
  const controller = new SettingsController(
    credentials as any,
    exchanges as any,
    positionsCache as any,
  );
  return { controller, credentials };
}

describe('SettingsController', () => {
  describe('connect', () => {
    it('stores a key that can trade and withdraw, and says what it can do', async () => {
      const permissions: KeyPermissions = { canTrade: true, canWithdraw: true };
      const { controller, credentials } = setup({
        verifyCredentials: async () => ({ success: true, permissions }),
      });

      const res = await controller.connect('u1', 'bybit', KEYS);

      expect(credentials.save).toHaveBeenCalledWith('u1', 'bybit', KEYS);
      expect(res.permissions).toEqual(permissions);
    });

    it('reports unknown permissions as null, not as read-only', async () => {
      const { controller } = setup({ verifyCredentials: async () => ({ success: true }) });

      const res = await controller.connect('u1', 'okx', { ...KEYS, passphrase: 'p' });

      expect(res.permissions).toBeNull();
    });

    it('still refuses a key the exchange does not accept', async () => {
      const { controller, credentials } = setup({
        verifyCredentials: async () => ({ success: false, error: 'API key is invalid' }),
      });

      await expect(controller.connect('u1', 'bybit', KEYS)).rejects.toThrow('API key is invalid');
      expect(credentials.save).not.toHaveBeenCalled();
    });
  });

  describe('permissions', () => {
    it('asks the exchange about the stored key', async () => {
      const getKeyPermissions = jest
        .fn()
        .mockResolvedValue({ canTrade: true, canWithdraw: false });
      const { controller } = setup({ getKeyPermissions });

      const res = await controller.permissions('u1', 'bybit');

      expect(getKeyPermissions).toHaveBeenCalledWith(KEYS);
      expect(res.permissions).toEqual({ canTrade: true, canWithdraw: false });
    });

    it('answers null for an exchange that cannot be asked', async () => {
      const { controller } = setup({});

      expect((await controller.permissions('u1', 'okx')).permissions).toBeNull();
    });

    it('answers null when the exchange did not answer', async () => {
      const { controller } = setup({ getKeyPermissions: async () => undefined });

      expect((await controller.permissions('u1', 'bybit')).permissions).toBeNull();
    });

    it('answers null for an exchange that is not connected', async () => {
      const getKeyPermissions = jest.fn();
      const { controller } = setup({ getKeyPermissions }, null);

      expect((await controller.permissions('u1', 'bybit')).permissions).toBeNull();
      expect(getKeyPermissions).not.toHaveBeenCalled();
    });
  });
});
