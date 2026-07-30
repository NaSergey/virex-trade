'use client';

import { useState } from 'react';
import { Wrap } from '@/shared/ui/Wrap';
import { ConfirmDialog, type ConfirmRequest } from '@/shared/ui/ConfirmDialog';
import { useBybitStatus, useSaveBybitKeys, useDisconnectBybit } from '@/shared/api/settings/hooks';

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
    <Wrap style={{ paddingBottom: 'var(--s6)' }}>
      <div className="pagehead">
        <div>
          <h1>Настройки</h1>
          <p className="lede">Подключение биржевого аккаунта.</p>
        </div>
      </div>

      <div className="set">
        {isLoading ? (
          <>
            <div className="skel" />
            <div className="skel" style={{ width: '60%' }} />
          </>
        ) : connected ? (
          <>
            <h2>Bybit — подключено</h2>
            <div className="kv">
              <span>API-ключ</span>
              <span className="mask">{data?.apiKeyMasked ?? '—'}</span>
            </div>
            <div className="kv">
              <span>Секрет</span>
              <span className="mask">••••••••••••••••••</span>
            </div>
            <p className="foot">
              Ключ и секрет хранятся зашифрованными и используются только вашим аккаунтом — для баланса,
              позиций, ордеров и синхронизации сделок.
            </p>

            <div className="risk-zone">
              <h2 style={{ color: 'var(--color-down)', borderColor: 'var(--color-down)' }}>
                Отключение биржи
              </h2>
              <p style={{ color: 'var(--color-muted)', marginBottom: 'var(--s3)' }}>
                История сделок и теги останутся в Virex. Новые данные перестанут приходить.
              </p>
              <button
                className="btn risk"
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
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Bybit — не подключено</h2>
            <div className="field">
              <label className="lbl" htmlFor="api-key">
                API-ключ
              </label>
              <input
                id="api-key"
                className="in full"
                autoComplete="off"
                placeholder="из личного кабинета Bybit"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="api-secret">
                Секрет
              </label>
              <input
                id="api-secret"
                className="in full"
                type="password"
                autoComplete="off"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
              />
            </div>
            <p className="foot">
              Создайте ключ в личном кабинете Bybit с правами на чтение и торговлю (Contract Trade) и{' '}
              <b>без права на вывод средств</b>. Ключ и секрет хранятся зашифрованными.
            </p>
            {save.isError && <p className="neg">{(save.error as Error).message}</p>}
            <button
              className="btn solid"
              style={{ marginTop: 'var(--s3)' }}
              disabled={save.isPending || !apiKey.trim() || !apiSecret.trim()}
              onClick={() => void submit()}
            >
              {save.isPending ? 'Проверка ключей…' : 'Подключить'}
            </button>
          </>
        )}
      </div>

      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </Wrap>
  );
};
