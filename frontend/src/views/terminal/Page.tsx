'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth, DEMO_EMAIL } from '@/features/auth';
import { useTerminalAccess } from '@/entities/terminal';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { PageHead } from '@/shared/ui/PageHead';
import { Wrap } from '@/shared/ui/Wrap';
import { TerminalSkeleton } from '@/widgets/backtest-session';
import { DemoTerminal } from './components/DemoTerminal';
import { TerminalScreen } from './components/TerminalScreen';

/**
 * Биржевой терминал — торговля на Bybit ключом пользователя.
 *
 * Страница есть только у того, чей ключ умеет ставить ордера: в шапке пункт
 * появляется по тому же ответу (`useTerminalAccess`). Сюда без доступа можно
 * попасть по прямому адресу или закладке — тогда вместо экрана стоит причина и
 * путь к настройкам, а не терминал, в котором биржа отклонит каждый ордер.
 */
export function TerminalPage() {
  const tt = useTranslations('terminal');
  const access = useTerminalAccess();
  const { user, loading } = useAuth();

  // Демо — общий аккаунт без ключа: вместо биржи тот же экран на симуляции.
  if (user?.email === DEMO_EMAIL) return <DemoTerminal />;
  if (access.data?.available) return <TerminalScreen />;
  // Пока не пришёл пользователь, неизвестно, демо это или биржа: надпись
  // слева внизу у них разная, и на её месте стоит серая полоса.
  if (loading || access.isLoading)
    return <TerminalSkeleton live badge={loading ? null : tt('realBadge')} leave={false} />;

  return (
    <Wrap page>
      <PageHead title={tt('pageTitle')} lede={tt('pageLede')} />
      {access.data?.reason ? (
        <EmptyState title={tt(`noAccess.${access.data.reason}.title`)}>
          {tt(`noAccess.${access.data.reason}.body`)}{' '}
          <Link href="/settings">{tt('toSettings')}</Link>
        </EmptyState>
      ) : (
        <>
          <ErrorNote error={access.error ?? new Error(tt('loadFailed'))} fallback={tt('loadFailed')} />
          <Button variant="solid" disabled={access.isFetching} onClick={() => void access.refetch()}>
            {tt('retry')}
          </Button>
        </>
      )}
    </Wrap>
  );
}
