'use client';

import { useTranslations } from 'next-intl';
import { useAuth, DEMO_EMAIL } from '@/features/auth';
import { useTerminalAccess } from '@/entities/terminal';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { PageHead } from '@/shared/ui/PageHead';
import { Wrap } from '@/shared/ui/Wrap';
import { TerminalSkeleton } from '@/widgets/backtest-session';
import { openSettings } from '@/widgets/settings-dialog';
import { DemoTerminal } from './components/DemoTerminal';
import { TerminalScreen } from './components/TerminalScreen';
import { useDemoChoice } from './model/demo';

/**
 * Биржевой терминал — торговля на Bybit ключом пользователя.
 *
 * Страница есть у всех (решение владельца 2026-10-16). Настоящий счёт — тому,
 * чей ключ умеет ставить ордера (`useTerminalAccess`). Остальным — причина
 * («нужен ключ с правом торговли») и выбор: подключить ключ в настройках или
 * торговать на демо-счёте (`DemoTerminal`, эфир бектеста). Выбранный демо-счёт
 * открывается сразу, но доступ к бирже сильнее выбора: появился ключ с правом
 * торговли — открывается настоящий терминал.
 */
export function TerminalPage() {
  const tt = useTranslations('terminal');
  const access = useTerminalAccess();
  const { user, loading } = useAuth();
  const [demoOf, setDemoOf] = useDemoChoice();
  const demoChosen = user != null && demoOf === user.id;

  // Демо-аккаунт — общий аккаунт без ключа: сразу тот же экран на симуляции.
  if (user?.email === DEMO_EMAIL) return <DemoTerminal />;
  if (access.data?.available) return <TerminalScreen />;
  // Пока не пришёл пользователь, неизвестно, демо это или биржа: надпись
  // слева внизу у них разная, и на её месте стоит серая полоса.
  if (loading || access.isLoading)
    return (
      <TerminalSkeleton
        live
        badge={loading ? null : demoChosen ? undefined : tt('realBadge')}
        leave={demoChosen}
      />
    );
  // Выбравшему демо и сбой запроса доступа не мешает: демо-счёт безопасен, а
  // когда ответ придёт с доступом, страница сама перейдёт на биржу.
  if (demoChosen) return <DemoTerminal connect />;

  return (
    <Wrap page>
      <PageHead title={tt('pageTitle')} lede={tt('pageLede')} />
      {access.data?.reason ? (
        <>
          <EmptyState title={tt(`noAccess.${access.data.reason}.title`)}>
            {tt(`noAccess.${access.data.reason}.body`)}
          </EmptyState>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="solid" onClick={() => openSettings('exchange')}>
              {tt('connectKey')}
            </Button>
            <Button onClick={() => user && setDemoOf(user.id)}>{tt('useDemo')}</Button>
          </div>
        </>
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
