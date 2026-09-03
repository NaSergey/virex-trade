'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
import { TelegramCard } from './components/TelegramCard';

/**
 * Подсказка о правах ключа — переводится на фронте по id биржи, а не приходит
 * с бэкенда: это тот же случай, что и коды ошибок (см. `resolveApiError`), но
 * для каталога бирж такого механизма ещё нет. Неизвестный id (новая биржа в
 * каталоге бэкенда, ещё не добавленная сюда) — откатывается на `permissionsHint`
 * с бэкенда как есть, по-русски: fallback, а не «безопасное» умолчание.
 */
function usePermissionsHints(): Record<string, string> {
  const t = useTranslations('settings');
  return {
    bybit: t('permissionsHintBybit'),
    okx: t('permissionsHintOkx'),
    bitget: t('permissionsHintBitget'),
    kucoin: t('permissionsHintKucoin'),
    gate: t('permissionsHintGate'),
    binance: t('permissionsHintBinance'),
    mexc: t('permissionsHintMexc'),
  };
}

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
  const t = useTranslations('settings');
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
        <PageHead title={t('pageTitle')} lede={t('pageLede')} />
        <SettingsSkeleton />
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
        <PageHead title={t('pageTitle')} lede={t('pageLede')} />
        <div className="set">
          <ErrorNote error={error ?? new Error(t('exchangesEmpty'))} fallback={t('loadFailed')} />
          <Button
            variant="solid"
            style={{ marginTop: 'var(--s3)' }}
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? t('retrying') : t('retry')}
          </Button>
        </div>
      </Wrap>
    );
  }

  const connectedCount = exchanges.filter((e) => e.connected).length;

  const askDisconnect = () =>
    setConfirm({
      title: t('disconnectConfirmTitle', { label: selected.label }),
      subtitle: t('disconnectConfirmSubtitle'),
      consequences: [
        t('disconnectConsequence1'),
        t('disconnectConsequence2'),
        t('disconnectConsequence3'),
      ],
      word: t('disconnectWord'),
      onConfirm: () => disconnect.mutate(selected.id),
    });

  return (
    <Wrap page>
      <PageHead title={t('pageTitle')} lede={t('pageLede')} />

      {/* Выбор биржи стоит над обеими дорожками: он относится ко всей
          странице, а зажатый в левую колонку ряд из семи делений ломался на
          две строки. Переключатель нужен, только когда выбирать есть из чего:
          одна поддерживаемая биржа — это не выбор, а лишний орган управления. */}
      {exchanges.length > 1 && (
        <Field label={t('exchangeLabel')} htmlFor="exchange-pick" data-tour="set-exchange">
          <Seg
            options={exchanges.map((e) => ({
              value: e.id,
              label: e.connected ? `${e.label} ✓` : e.label,
              title: e.connected
                ? t('exchangeConnectedTitle', { label: e.label })
                : t('exchangeNotConnectedTitle', { label: e.label }),
            }))}
            value={selected.id}
            onChange={setSelectedId}
            ariaLabel={t('exchangeLabel')}
            /* Ряд из семи делений не встаёт в строку на узком экране, а вне
               карточки правило переноса к нему не применяется. */
            className="wrap"
          />
        </Field>
      )}

      {/* Две равные дорожки: ключи слева, уведомления справа. Ни одна не
          главнее другой, поэтому `even`, а не асимметрия. На узком экране
          сетка складывается в одну колонку, а линейка переезжает наверх. */}
      <div className="asym even">
        <div className="set" data-tour="set-form">
          {selected.connected && !selected.needsReconnect ? (
            <ConnectedExchange
              exchange={selected}
              isActive={data?.activeExchange === selected.id}
              canActivate={connectedCount > 1}
              activating={setActive.isPending}
              onActivate={() => setActive.mutate(selected.id)}
            />
          ) : (
            <ConnectForm
              exchange={selected}
              pending={connect.isPending}
              error={connect.error}
              onSubmit={(vars) => connect.mutateAsync({ exchange: selected.id, ...vars })}
              notice={selected.needsReconnect ? t('needsReconnectNotice') : undefined}
            />
          )}

          {/* Отключение стоит здесь же, под ключами, к которым относится, —
              а не отдельным ярусом под всей страницей: там его приходилось
              искать после пустого низа левой дорожки.
              Битое подключение всё равно числится подключением, и снять его
              надо уметь, не вводя ключи заново, — поэтому условие только
              `connected`. */}
          {selected.connected && (
            <DisconnectZone
              exchange={selected}
              onDisconnect={askDisconnect}
              disconnecting={disconnect.isPending}
            />
          )}
        </div>

        {/* Отдельным блоком, а не внутри карточки биржи: Telegram не относится
            к ключам и живёт своей жизнью — привязан он или нет, биржа работает
            одинаково. */}
        <div className="set marg">
          <TelegramCard />
        </div>
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
}: {
  exchange: ExchangeInfo;
  isActive: boolean;
  canActivate: boolean;
  activating: boolean;
  onActivate: () => void;
}) {
  const t = useTranslations('settings');
  return (
    <>
      <h2>
        {t('exchangeConnectedTitle', { label: exchange.label })}
        {isActive ? t('exchangeActiveSuffix') : ''}
      </h2>
      <KeyValue label={t('apiKeyLabel')} valueClassName="mask">
        {exchange.apiKeyMasked ?? '—'}
      </KeyValue>
      <KeyValue label={t('secretLabel')} valueClassName="mask">
        ••••••••••••••••••
      </KeyValue>
      {exchange.needsPassphrase && (
        <KeyValue label="Passphrase" valueClassName="mask">
          ••••••••••••
        </KeyValue>
      )}
      <p className="foot">{t('keysStorageNote')}</p>

      {/* Кнопка появляется, только когда подключено больше одной биржи:
          «сделать активной» единственную — действие без последствий. */}
      {canActivate && !isActive && (
        <Button variant="solid" disabled={activating} onClick={onActivate}>
          {activating ? t('switching') : t('workWith', { label: exchange.label })}
        </Button>
      )}
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
  const t = useTranslations('settings');
  return (
    <div className="risk-zone">
      <h2 style={{ color: 'var(--color-down)', borderColor: 'var(--color-down)' }}>
        {t('disconnectSectionTitle')}
      </h2>
      <p className="muted" style={{ marginBottom: 'var(--s3)' }}>
        {t('disconnectNote')}
      </p>
      <Button variant="risk" disabled={disconnecting} onClick={onDisconnect}>
        {disconnecting ? t('disconnecting') : t('disconnectButton', { label: exchange.label })}
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
  const t = useTranslations('settings');
  const permissionsHints = usePermissionsHints();
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
      <h2>{notice ? t('exchangeKeysUnreadableTitle', { label: exchange.label }) : t('exchangeNotConnectedTitle', { label: exchange.label })}</h2>
      {notice && <p className="neg">{notice}</p>}
      <Field label={t('apiKeyLabel')} htmlFor="api-key">
        <Input
          id="api-key"
          full
          autoComplete="off"
          placeholder={t('apiKeyPlaceholder', { label: exchange.label })}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </Field>
      <Field label={t('secretLabel')} htmlFor="api-secret">
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
            placeholder={t('passphrasePlaceholder', { label: exchange.label })}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </Field>
      )}
      <p className="foot">
        {permissionsHints[exchange.id] ?? exchange.permissionsHint} {t('keysEncryptedShort')}
      </p>
      <ErrorNote error={error} fallback={t('connectFailed')} />
      <Button
        variant="solid"
        style={{ marginTop: 'var(--s3)' }}
        disabled={pending || !ready}
        onClick={() => void submit()}
      >
        {pending ? t('checkingKeys') : t('connect')}
      </Button>
    </>
  );
}

/**
 * Настройки, пока каталог бирж едет.
 *
 * Раньше здесь стояли две полосы поперёк листа — они не были похожи ни на один
 * из двух видов этой страницы, и приход ответа перестраивал экран целиком.
 * Заглушка повторяет вид подключённой биржи: переключатель, заголовок, три
 * справочные пары и сноска о хранении ключей. Это чаще всего и приезжает —
 * человек, у которого ключей ещё нет, доходит сюда один раз, а тот, у кого они
 * есть, открывает эту страницу снова и снова.
 *
 * Опасная зона в заглушке не воспроизводится: красная линейка и слово
 * «Отключить» под ней — обещание, которое нельзя давать вслепую, пока неясно,
 * подключено ли вообще что-нибудь.
 */
function SettingsSkeleton() {
  return (
    <div className="set" aria-hidden>
      <Skeleton height={9} width={64} />
      <Skeleton height={26} width={220} />
      <div style={{ marginTop: 'var(--s4)' }}>
        <Skeleton height={16} width="46%" />
      </div>
      {[0, 1, 2].map((i) => (
        <div className="kv" key={i}>
          <Skeleton as="span" flush height={9} width={92} />
          <Skeleton as="span" flush height={9} width={168} />
        </div>
      ))}
      <p className="foot">
        <Skeleton as="span" flush height={8} width="78%" />
      </p>
    </div>
  );
}
