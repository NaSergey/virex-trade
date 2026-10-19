'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTerminalAccess } from '@/entities/terminal';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog, type ConfirmRequest } from '@/shared/ui/ConfirmDialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Input } from '@/shared/ui/Field';
import { Skeleton } from '@/shared/ui/Skeleton';
import { cn } from '@/shared/lib/utils/css';
import {
  useConnectExchange,
  useDisconnectExchange,
  useExchanges,
  useKeyPermissions,
  useSetActiveExchange,
  type ExchangeInfo,
  type KeyPermissions,
} from '../api/exchanges';
import { Hint, Row, Section } from './Rows';

/**
 * Подсказка о правах ключа — переводится на фронте по id биржи, а не приходит
 * с бэкенда. Неизвестный id (новая биржа в каталоге бэкенда, ещё не
 * добавленная сюда) откатывается на `permissionsHint` с бэкенда как есть, по-
 * русски: fallback, а не «безопасное» умолчание.
 */
function usePermissionsHints(): Record<string, string> {
  const t = useTranslations('settings');
  return {
    bybit: t('permissionsHintBybit'),
    'bybit-demo': t('permissionsHintBybitDemo'),
    okx: t('permissionsHintOkx'),
    bitget: t('permissionsHintBitget'),
    kucoin: t('permissionsHintKucoin'),
    gate: t('permissionsHintGate'),
    binance: t('permissionsHintBinance'),
    mexc: t('permissionsHintMexc'),
  };
}

/**
 * Вкладка «Биржа»: слева список бирж, посередине ключи выбранной, справа —
 * что ключ умеет, как он хранится и отключение.
 *
 * Бирж может быть подключено несколько, но работает приложение с одной —
 * активной. Отключение подтверждается набором слова: это единственное
 * действие в продукте, которое останавливает поступление данных, и оно не
 * должно случаться от промаха мышью.
 */
export function ExchangeTab() {
  const t = useTranslations('settings');
  const { data, isLoading, error, refetch, isFetching } = useExchanges();
  const connect = useConnectExchange();
  const disconnect = useDisconnectExchange();
  const setActive = useSetActiveExchange();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const exchanges = data?.exchanges ?? [];
  // Пока ничего не выбрано руками — активная биржа, а если не подключено
  // ничего, первая из каталога, чтобы форма была не пустой.
  const selected =
    exchanges.find((e) => e.id === selectedId) ??
    exchanges.find((e) => e.id === data?.activeExchange) ??
    exchanges[0];

  if (isLoading) return <ExchangeSkeleton />;

  // Неудача называется вслух, и рядом стоит повтор: чинить биржу больше негде.
  if (error || !selected) {
    return (
      <div className="stg-grid">
        <div className="stg-col">
          <ErrorNote error={error ?? new Error(t('exchangesEmpty'))} fallback={t('loadFailed')} />
          <Button variant="solid" className="stg-wide" disabled={isFetching} onClick={() => void refetch()}>
            {isFetching ? t('retrying') : t('retry')}
          </Button>
        </div>
      </div>
    );
  }

  const connectedCount = exchanges.filter((e) => e.connected).length;
  const isActive = data?.activeExchange === selected.id;
  const ready = selected.connected && !selected.needsReconnect;

  const askDisconnect = () =>
    setConfirm({
      title: t('disconnectConfirmTitle', { label: selected.label }),
      subtitle: t('disconnectConfirmSubtitle'),
      consequences: [t('disconnectConsequence1'), t('disconnectConsequence2'), t('disconnectConsequence3')],
      onConfirm: () => disconnect.mutate(selected.id),
    });

  return (
    <div className="stg-grid">
      <div className="stg-col">
        <Section title={t('exchangesTitle')}>
          {exchanges.map((e) => (
            <Button
              key={e.id}
              variant="none"
              className={cn('stg-row stg-pick', e.id === selected.id && 'is-on')}
              aria-pressed={e.id === selected.id}
              onClick={() => setSelectedId(e.id)}
            >
              <span className="stg-k">{e.label}</span>
              <span className="stg-v">
                {e.id === data?.activeExchange && e.connected
                  ? t('exchangeActive')
                  : e.connected
                    ? t('exchangeConnected')
                    : '—'}
              </span>
            </Button>
          ))}
        </Section>
      </div>

      <div className="stg-col">
        {ready ? (
          <ConnectedKeys
            exchange={selected}
            isActive={isActive}
            canActivate={connectedCount > 1}
            activating={setActive.isPending}
            onActivate={() => setActive.mutate(selected.id)}
          />
        ) : (
          <ConnectForm
            key={selected.id}
            exchange={selected}
            pending={connect.isPending}
            error={connect.error}
            onSubmit={(vars) => connect.mutateAsync({ exchange: selected.id, ...vars })}
            notice={selected.needsReconnect ? t('needsReconnectNotice') : undefined}
          />
        )}
      </div>

      <div className="stg-col">
        {ready && <KeyNotes exchange={selected} isActive={isActive} />}
        {/* Битое подключение тоже числится подключением, и снять его надо
            уметь, не вводя ключи заново, — поэтому условие только `connected`. */}
        {selected.connected && (
          <Section title={t('disconnectSectionTitle')} risk>
            <Hint>{t('disconnectNote')}</Hint>
            <Button variant="risk" className="stg-wide" disabled={disconnect.isPending} onClick={askDisconnect}>
              {disconnect.isPending ? t('disconnecting') : t('disconnectButton', { label: selected.label })}
            </Button>
          </Section>
        )}
      </div>

      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function ConnectedKeys({
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
  const rights = useKeyPermissions(exchange.id);
  const perms = rights.data;
  return (
    <Section title={t('keysTitle', { label: exchange.label })}>
      <Row label={t('apiKeyLabel')}>
        <span className="mask">{exchange.apiKeyMasked ?? '—'}</span>
      </Row>
      <Row label={t('secretLabel')}>
        <span className="mask">••••••••••••</span>
      </Row>
      {exchange.needsPassphrase && (
        <Row label="Passphrase">
          <span className="mask">••••••••</span>
        </Row>
      )}
      {/* Подключается ключ с любыми правами — вместо отказа окно говорит, что
          он умеет. «Биржа не сказала» так и названо: это не «только чтение». */}
      <Row label={t('keyRightsLabel')}>
        {rights.isLoading ? (
          <Skeleton as="span" flush height={9} width={90} />
        ) : perms ? (
          t(rightsKey(perms))
        ) : (
          t('keyRightsUnknown')
        )}
      </Row>
      {/* «Сделать активной» единственную подключённую — действие без последствий. */}
      {canActivate && !isActive && (
        <Button variant="solid" className="stg-wide" disabled={activating} onClick={onActivate}>
          {activating ? t('switching') : t('workWith', { label: exchange.label })}
        </Button>
      )}
    </Section>
  );
}

/**
 * Что ключ умеет и как он хранится. Торговля — не лишнее право: оно открывает
 * терминал, и сказано это только там, где терминал и правда открыт (ответом
 * самого терминала, а не догадкой по правам). Лишний только вывод.
 */
function KeyNotes({ exchange, isActive }: { exchange: ExchangeInfo; isActive: boolean }) {
  const t = useTranslations('settings');
  const perms = useKeyPermissions(exchange.id).data;
  const hasTerminal = useTerminalAccess().data?.available === true;
  return (
    <Section title={t('keyNotesTitle')}>
      {isActive && hasTerminal && <Hint>{t('keyRightsTradeNote', { label: exchange.label })}</Hint>}
      {perms?.canWithdraw && <Hint error>{t('keyRightsWithdrawNote', { label: exchange.label })}</Hint>}
      <Hint>{t('keysStorageNote')}</Hint>
    </Section>
  );
}

/** Ключ перевода для строки «Права ключа»: чтение есть всегда, остальное — что сказала биржа. */
function rightsKey({ canTrade, canWithdraw }: KeyPermissions) {
  if (canTrade && canWithdraw) return 'keyRightsAll';
  if (canTrade) return 'keyRightsTrade';
  if (canWithdraw) return 'keyRightsWithdraw';
  return 'keyRightsReadOnly';
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
  const hints = usePermissionsHints();
  const ids = { key: useId(), secret: useId(), pass: useId() };
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const needsPassphrase = exchange.needsPassphrase;
  const ready = !!apiKey.trim() && !!apiSecret.trim() && (!needsPassphrase || !!passphrase.trim());

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
    <Section
      title={
        notice
          ? t('exchangeKeysUnreadableTitle', { label: exchange.label })
          : t('exchangeNotConnectedTitle', { label: exchange.label })
      }
    >
      <form
        className="stg-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {notice && <Hint error>{notice}</Hint>}
        <Row label={t('apiKeyLabel')} htmlFor={ids.key}>
          <Input
            id={ids.key}
            full
            autoComplete="off"
            placeholder={t('apiKeyPlaceholder', { label: exchange.label })}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </Row>
        <Row label={t('secretLabel')} htmlFor={ids.secret}>
          <Input
            id={ids.secret}
            full
            type="password"
            autoComplete="off"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
          />
        </Row>
        {needsPassphrase && (
          <Row label="Passphrase" htmlFor={ids.pass}>
            <Input
              id={ids.pass}
              full
              type="password"
              autoComplete="off"
              placeholder={t('passphrasePlaceholder', { label: exchange.label })}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
          </Row>
        )}
        <Hint>
          {hints[exchange.id] ?? exchange.permissionsHint} {t('keysEncryptedShort')}
        </Hint>
        <Button type="submit" variant="solid" className="stg-wide" disabled={pending || !ready}>
          {pending ? t('checkingKeys') : t('connect')}
        </Button>
      </form>
      <ErrorNote error={error} fallback={t('connectFailed')} />
    </Section>
  );
}

/** Заглушка вкладки, пока едет каталог бирж: список слева и строки ключей. */
function ExchangeSkeleton() {
  return (
    <div className="stg-grid" aria-hidden>
      {[7, 4].map((n, c) => (
        <div className="stg-col" key={c}>
          <Skeleton height={14} width={120} flush />
          {Array.from({ length: n }, (_, i) => (
            <Skeleton key={i} height={30} flush />
          ))}
        </div>
      ))}
    </div>
  );
}
