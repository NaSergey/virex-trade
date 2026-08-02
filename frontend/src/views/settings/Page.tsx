'use client';

import { useState } from 'react';
import { Wrap } from '@/shared/ui/Wrap';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';
import { PageHead } from '@/shared/ui/PageHead';
import { KeyValue } from '@/shared/ui/Lookup';
import { Skeleton } from '@/shared/ui/Skeleton';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { ConfirmDialog, type ConfirmRequest } from '@/shared/ui/ConfirmDialog';
import { useBybitStatus, useSaveBybitKeys, useDisconnectBybit } from './api/hooks';

/**
 * Настройки: подключение биржевого аккаунта, и только оно.
 *
 * Отключение вынесено в опасную зону под красной линейкой и подтверждается
 * набором слова: это единственное действие в продукте, которое останавливает
 * поступление данных, и оно не должно случаться от промаха мышью.
 */
export const SettingsPage = () => {
  const { data, isLoading } = useBybitStatus();
  const save = useSaveBybitKeys();
  const disconnect = useDisconnectBybit();

  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const connected = data?.connected ?? false;

  const submit = async () => {
    if (!apiKey.trim() || !apiSecret.trim()) return;
    try {
      await save.mutateAsync({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim() });
      setApiKey('');
      setApiSecret('');
    } catch {
      // Ошибка показана ниже через save.error.
    }
  };

  return (
    <Wrap page>
      <PageHead title="Настройки" lede="Подключение биржевого аккаунта." />

      <div className="set">
        {isLoading ? (
          <>
            <Skeleton />
            <Skeleton width="60%" />
          </>
        ) : connected ? (
          <>
            <h2>Bybit — подключено</h2>
            <KeyValue label="API-ключ" valueClassName="mask">
              {data?.apiKeyMasked ?? '—'}
            </KeyValue>
            <KeyValue label="Секрет" valueClassName="mask">
              ••••••••••••••••••
            </KeyValue>
            <p className="foot">
              Ключ и секрет хранятся зашифрованными и используются только вашим аккаунтом — для баланса,
              позиций, ордеров и синхронизации сделок.
            </p>

            <div className="risk-zone">
              <h2 style={{ color: 'var(--color-down)', borderColor: 'var(--color-down)' }}>
                Отключение биржи
              </h2>
              <p className="muted" style={{ marginBottom: 'var(--s3)' }}>
                История сделок и теги останутся в Virex. Новые данные перестанут приходить.
              </p>
              <Button
                variant="risk"
                disabled={disconnect.isPending}
                onClick={() =>
                  setConfirm({
                    title: 'Отключить Bybit?',
                    subtitle: 'История сделок и теги останутся в Virex.',
                    consequences: [
                      'открытые позиции перестанут обновляться',
                      'новые сделки не будут подгружаться',
                      'ордера на бирже останутся как есть — отменить их можно будет только после повторного подключения тех же ключей',
                    ],
                    word: 'ОТКЛЮЧИТЬ',
                    onConfirm: () => disconnect.mutate(),
                  })
                }
              >
                {disconnect.isPending ? 'Отключение…' : 'Отключить Bybit'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2>Bybit — не подключено</h2>
            <Field label="API-ключ" htmlFor="api-key">
              <Input
                id="api-key"
                full
                autoComplete="off"
                placeholder="из личного кабинета Bybit"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </Field>
            <Field label="Секрет" htmlFor="api-secret">
              <Input
                id="api-secret"
                full
                type="password"
                autoComplete="off"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
              />
            </Field>
            <p className="foot">
              Создайте ключ в личном кабинете Bybit с правами на чтение и торговлю (Contract Trade) и{' '}
              <b>без права на вывод средств</b>. Ключ и секрет хранятся зашифрованными.
            </p>
            <ErrorNote error={save.error} fallback="Не удалось подключить ключи" />
            <Button
              variant="solid"
              style={{ marginTop: 'var(--s3)' }}
              disabled={save.isPending || !apiKey.trim() || !apiSecret.trim()}
              onClick={() => void submit()}
            >
              {save.isPending ? 'Проверка ключей…' : 'Подключить'}
            </Button>
          </>
        )}
      </div>

      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </Wrap>
  );
};
