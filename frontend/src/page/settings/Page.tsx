'use client';

import { useState } from 'react';
import { KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { Input } from '@/shared/ui/Input';
import { Button } from '@/shared/ui/Button';
import { useBybitStatus, useSaveBybitKeys, useDisconnectBybit } from '@/shared/api/settings/hooks';
import { useConfirmAction } from '@/shared/lib/hooks/useConfirmAction';

const DISCONNECT_ID = 'disconnect';

export const SettingsPage = () => {
  const { data, isLoading } = useBybitStatus();
  const save = useSaveBybitKeys();
  const disconnect = useDisconnectBybit();

  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const disconnectConfirm = useConfirmAction();

  const connected = data?.connected ?? false;

  const handleSave = async () => {
    if (!apiKey.trim() || !apiSecret.trim()) return;
    try {
      await save.mutateAsync({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim() });
      setApiKey('');
      setApiSecret('');
    } catch {
      // error surfaced via save.error below
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-app">
      <div className="flex shrink-0 items-center border-b border-line px-4 py-3">
        <span className="text-sm font-semibold text-fg">Настройки</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-lg space-y-4">
          <div className="panel p-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-fg" />
              <h3 className="text-sm font-semibold text-fg">Подключение Bybit</h3>
            </div>
            <p className="mt-1.5 text-xs leading-snug text-muted">
              API-ключ и секрет хранятся в зашифрованном виде и используются только вашим аккаунтом —
              для баланса, позиций, ордеров и торговых ботов.
            </p>

            {isLoading ? (
              <p className="mt-4 text-xs text-muted">Загрузка…</p>
            ) : connected ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-up/30 bg-up/10 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-up" />
                    <div>
                      <p className="text-xs font-medium text-fg">Подключено</p>
                      <p className="font-mono text-[11px] text-muted">{data?.apiKeyMasked}</p>
                    </div>
                  </div>
                </div>
                <Button
                  variant={disconnectConfirm.isConfirming(DISCONNECT_ID) ? 'danger' : 'outline'}
                  size="sm"
                  fullWidth
                  onClick={() => disconnectConfirm.requestOrConfirm(DISCONNECT_ID, () => disconnect.mutate())}
                  disabled={disconnect.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {disconnect.isPending
                    ? 'Отключение…'
                    : disconnectConfirm.isConfirming(DISCONNECT_ID)
                      ? 'Подтвердить отключение'
                      : 'Отключить Bybit'}
                </Button>
                {disconnectConfirm.isConfirming(DISCONNECT_ID) && (
                  <p className="text-[11px] text-muted">
                    Работающие боты будут остановлены (открытые на бирже ордера останутся как есть — отменить их
                    можно будет только после повторного подключения тех же ключей).
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <Input
                  label="API Key"
                  value={apiKey}
                  onChange={setApiKey}
                  placeholder="Вставьте API key из Bybit"
                  autoComplete="off"
                />
                <Input
                  label="API Secret"
                  type="password"
                  value={apiSecret}
                  onChange={setApiSecret}
                  placeholder="Вставьте API secret из Bybit"
                  autoComplete="off"
                />
                <p className="text-[11px] leading-snug text-muted">
                  Создайте ключ в личном кабинете Bybit (раздел управления API-ключами) с правами на чтение и
                  торговлю (Contract Trade), без права на вывод средств.
                </p>
                {save.isError && <p className="text-[11px] text-down">{(save.error as Error).message}</p>}
                <Button
                  variant="primary"
                  size="sm"
                  fullWidth
                  onClick={handleSave}
                  disabled={save.isPending || !apiKey.trim() || !apiSecret.trim()}
                >
                  {save.isPending ? 'Проверка ключей…' : 'Подключить'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
