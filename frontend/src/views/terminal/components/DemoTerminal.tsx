'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Wrap } from '@/shared/ui/Wrap';
import {
  SessionScreen,
  TerminalSkeleton,
  useBacktestSessions,
  useCreateSession,
} from '@/widgets/backtest-session';

/**
 * Терминал демо-аккаунта — тот же экран, что у бектеста, на живой симуляции
 * («Эфир»): у демо нет ключа биржи, а аккаунт общий для всех гостей, так что
 * настоящих ордеров здесь быть не может.
 *
 * Сессия берётся последняя из активных эфирных, а если её нет — заводится
 * новая. Сессия общая, как и сам демо-аккаунт: всё, что гость поставит, увидит
 * следующий.
 */
export function DemoTerminal() {
  const t = useTranslations('terminal');
  const router = useRouter();
  const sessions = useBacktestSessions();
  const create = useCreateSession();
  // Один запрос на заход: StrictMode монтирует эффект дважды, а ответ мутации
  // приходит позже, чем второй запуск.
  const asked = useRef(false);

  const existing = sessions.data?.sessions.find((s) => s.dataSource === 'live' && s.status === 'active');
  const created = create.data?.session.id;

  useEffect(() => {
    if (!sessions.data || existing || asked.current) return;
    asked.current = true;
    create.mutate({ startBalance: 10_000, hideDate: false, hidePrice: false, dataSource: 'live' });
  }, [sessions.data, existing, create]);

  const id = existing?.id ?? created;
  if (id) return <SessionScreen id={id} live onLeave={() => router.push('/backtest')} />;

  const error = sessions.error ?? create.error;
  if (error)
    return (
      <Wrap page>
        <ErrorNote error={error} fallback={t('loadFailed')} />
        <Button variant="solid" onClick={() => window.location.reload()}>
          {t('retry')}
        </Button>
      </Wrap>
    );
  return <TerminalSkeleton live />;
}
