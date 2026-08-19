'use client';

import { useState } from 'react';
import { Wrap } from '@/shared/ui/Wrap';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';
import { PageHead } from '@/shared/ui/PageHead';
import { KeyValue } from '@/shared/ui/Lookup';
import { Seg } from '@/shared/ui/Seg';
import { Skeleton } from '@/shared/ui/Skeleton';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { ConfirmDialog, type ConfirmRequest } from '@/shared/ui/ConfirmDialog';
import {
  useConnectExchange,
  useDisconnectExchange,
  useExchanges,
  useSetActiveExchange,
  type ExchangeInfo,
} from './api/hooks';

/**
 * Настройки: подключение биржевых аккаунтов, и только оно.
 *
 * Бирж может быть подключено несколько, но работает приложение с одной —
 * активной. Поэтому страница состоит из двух ярусов: выбор активной сверху
 * (виден, только когда выбирать реально есть из чего) и карточка выбранной
 * биржи под ним.
 *
 * Отключение вынесено в опасную зону под красной линейкой и подтверждается
 * набором слова: это единственное действие в продукте, которое останавливает
 * поступление данных, и оно не должно случаться от промаха мышью.
 */
export const SettingsPage = () => {
  const { data, isLoading, error, refetch, isFetching } = useExchanges();
  const connect = useConnectExchange();
  const disconnect = useDisconnectExchange();
  const setActive = useSetActiveExchange();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const exchanges = data?.exchanges ?? [];
  // Пока пользователь ничего не выбрал руками, показываем активную биржу — а
  // если не подключено ничего, первую из каталога, чтобы форма была не пустой.
  const selected =
    exchanges.find((e) => e.id === selectedId) ??
    exchanges.find((e) => e.id === data?.activeExchange) ??
    exchanges[0];

  if (isLoading) {
    return (
      <Wrap page>
        <PageHead title="Настройки" lede="Подключение биржевого аккаунта." />
        <div className="set">
          <Skeleton />
          <Skeleton width="60%" />
        </div>
      </Wrap>
    );
  }

  // Неудачу запроса раньше рисовала та же заглушка, что и загрузку: страница
  // молча стояла скелетом навсегда, и выглядело это как «настройки не
  // открываются». Ошибка называется вслух, и рядом стоит кнопка повтора —
  // страницу ключей нельзя оставлять без выхода, чинить биржу больше негде.
  if (error || !selected) {
    return (
      <Wrap page>
        <PageHead title="Настройки" lede="Подключение биржевого аккаунта." />
        <div className="set">
          <ErrorNote
            error={error ?? new Error('Список бирж пуст — сервер не вернул ни одной.')}
            fallback="Не удалось загрузить настройки бирж"
          />
          <Button
            variant="solid"
            style={{ marginTop: 'var(--s3)' }}
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? 'Загрузка…' : 'Повторить'}
          </Button>
        </div>
      </Wrap>
    );
  }

  const connectedCount = exchanges.filter((e) => e.connected).length;

  const askDisconnect = () =>
    setConfirm({
      title: `Отключить ${selected.label}?`,
      subtitle: 'История сделок и теги останутся в Virex.',
      consequences: [
        'открытые позиции перестанут обновляться',
        'новые сделки не будут подгружаться',
        'ордера на бирже останутся как есть — отменить их можно будет только после повторного подключения тех же ключей',
      ],
      word: 'ОТКЛЮЧИТЬ',
      onConfirm: () => disconnect.mutate(selected.id),
    });

  return (
    <Wrap page>
      <PageHead title="Настройки" lede="Подключение биржевого аккаунта." />

      <div className="set">
        {/* Переключатель нужен, только когда выбирать есть из чего: одна
            поддерживаемая биржа — это не выбор, а лишний орган управления. */}
        {exchanges.length > 1 && (
          <Field label="Биржа" htmlFor="exchange-pick">
            <Seg
              options={exchanges.map((e) => ({
                value: e.id,
                label: e.connected ? `${e.label} ✓` : e.label,
                title: e.connected ? `${e.label} — подключено` : `${e.label} — не подключено`,
              }))}
              value={selected.id}
              onChange={setSelectedId}
              ariaLabel="Биржа"
            />
          </Field>
        )}

        {selected.connected && !selected.needsReconnect ? (
          <ConnectedExchange
            exchange={selected}
            isActive={data?.activeExchange === selected.id}
            canActivate={connectedCount > 1}
            activating={setActive.isPending}
            onActivate={() => setActive.mutate(selected.id)}
            onDisconnect={askDisconnect}
            disconnecting={disconnect.isPending}
          />
        ) : (
          <>
            <ConnectForm
              exchange={selected}
              pending={connect.isPending}
              error={connect.error}
              onSubmit={(vars) => connect.mutateAsync({ exchange: selected.id, ...vars })}
              notice={
                selected.needsReconnect
                  ? 'Ключи сохранены, но сервер не может их прочитать — они зашифрованы другим мастер-ключом. Введите их заново.'
                  : undefined
              }
            />
            {/* Битое подключение всё равно числится подключением, и убрать его
                надо уметь, не вводя ключи заново. */}
            {selected.connected && (
              <DisconnectZone
                exchange={selected}
                onDisconnect={askDisconnect}
                disconnecting={disconnect.isPending}
              />
            )}
          </>
        )}
      </div>

      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </Wrap>
  );
};

function ConnectedExchange({
  exchange,
  isActive,
  canActivate,
  activating,
  onActivate,
  onDisconnect,
  disconnecting,
}: {
  exchange: ExchangeInfo;
  isActive: boolean;
  canActivate: boolean;
  activating: boolean;
  onActivate: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  return (
    <>
      <h2>
        {exchange.label} — подключено{isActive ? ' · активная' : ''}
      </h2>
      <KeyValue label="API-ключ" valueClassName="mask">
        {exchange.apiKeyMasked ?? '—'}
      </KeyValue>
      <KeyValue label="Секрет" valueClassName="mask">
        ••••••••••••••••••
      </KeyValue>
      {exchange.needsPassphrase && (
        <KeyValue label="Passphrase" valueClassName="mask">
          ••••••••••••
        </KeyValue>
      )}
      <p className="foot">
        Ключ и секрет хранятся зашифрованными и используются только вашим аккаунтом — для баланса,
        позиций, ордеров и синхронизации сделок.
      </p>

      {/* Кнопка появляется, только когда подключено больше одной биржи:
          «сделать активной» единственную — действие без последствий. */}
      {canActivate && !isActive && (
        <Button variant="solid" disabled={activating} onClick={onActivate}>
          {activating ? 'Переключение…' : `Работать с ${exchange.label}`}
        </Button>
      )}

      <DisconnectZone
        exchange={exchange}
        onDisconnect={onDisconnect}
        disconnecting={disconnecting}
      />
    </>
  );
}

/**
 * Опасная зона под красной линейкой. Отдельным компонентом, потому что нужна
 * не только подключённой бирже: подключение с нечитаемыми ключами тоже надо
 * уметь снять, а карточки с ключами у него нет.
 */
function DisconnectZone({
  exchange,
  onDisconnect,
  disconnecting,
}: {
  exchange: ExchangeInfo;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  return (
    <div className="risk-zone">
      <h2 style={{ color: 'var(--color-down)', borderColor: 'var(--color-down)' }}>
        Отключение биржи
      </h2>
      <p className="muted" style={{ marginBottom: 'var(--s3)' }}>
        История сделок и теги останутся в Virex. Новые данные перестанут приходить.
      </p>
      <Button variant="risk" disabled={disconnecting} onClick={onDisconnect}>
        {disconnecting ? 'Отключение…' : `Отключить ${exchange.label}`}
      </Button>
    </div>
  );
}

function ConnectForm({
  exchange,
  pending,
  error,
  onSubmit,
  notice,
}: {
  exchange: ExchangeInfo;
  pending: boolean;
  error: unknown;
  onSubmit: (vars: { apiKey: string; apiSecret: string; passphrase?: string }) => Promise<unknown>;
  /** Почему форма показана снова, когда биржа уже числится подключённой. */
  notice?: string;
}) {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');

  const needsPassphrase = exchange.needsPassphrase;
  const ready =
    !!apiKey.trim() && !!apiSecret.trim() && (!needsPassphrase || !!passphrase.trim());

  const submit = async () => {
    if (!ready) return;
    try {
      await onSubmit({
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        ...(needsPassphrase ? { passphrase: passphrase.trim() } : {}),
      });
      setApiKey('');
      setApiSecret('');
      setPassphrase('');
    } catch {
      // Ошибка показана ниже через error.
    }
  };

  return (
    <>
      <h2>{exchange.label} — {notice ? 'ключи не читаются' : 'не подключено'}</h2>
      {notice && <p className="neg">{notice}</p>}
      <Field label="API-ключ" htmlFor="api-key">
        <Input
          id="api-key"
          full
          autoComplete="off"
          placeholder={`из личного кабинета ${exchange.label}`}
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
      {needsPassphrase && (
        <Field label="Passphrase" htmlFor="api-passphrase">
          <Input
            id="api-passphrase"
            full
            type="password"
            autoComplete="off"
            placeholder={`задаётся при создании ключа в ${exchange.label}`}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </Field>
      )}
      <p className="foot">
        {exchange.permissionsHint} Ключ и секрет хранятся зашифрованными.
      </p>
      <ErrorNote error={error} fallback="Не удалось подключить ключи" />
      <Button
        variant="solid"
        style={{ marginTop: 'var(--s3)' }}
        disabled={pending || !ready}
        onClick={() => void submit()}
      >
        {pending ? 'Проверка ключей…' : 'Подключить'}
      </Button>
    </>
  );
}
