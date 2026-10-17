'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Wrap } from '@/shared/ui/Wrap';
import { openSettings } from '@/widgets/settings-dialog';
import {
  SessionScreen,
  TerminalSkeleton,
  useBacktestSessions,
  useCreateSession,
} from '@/widgets/backtest-session';
import { demoSessionOf } from '../model/demo';

/**
 * Терминал на демо-счёте — тот же экран, что у бектеста, на живом рынке
 * («Эфир»): ордера исполняет наш движок, на биржу не уходит ничего.
 *
 * Два входа: демо-аккаунт (у него нет ключа биржи, а аккаунт общий для всех
 * гостей, так что настоящих ордеров здесь быть не может) и любой, чей ключ не
 * умеет торговать и кто выбрал демо-счёт на странице терминала.
 *
 * Сессия берётся последняя из активных эфирных, а если её нет — заводится
 * новая. У демо-аккаунта она общая, как и сам аккаунт: всё, что гость
 * поставит, увидит следующий.
 */
export function DemoTerminal({
  connect = false,
}: {
  /**
   * «Подключить биржу» слева от кнопок графика — путь от демо к настоящему
   * счёту. У демо-аккаунта её нет: аккаунт общий, и ключ к нему не подключают.
   */
  connect?: boolean;
}) {
  const t = useTranslations('terminal');
  const router = useRouter();
  const sessions = useBacktestSessions();
  const create = useCreateSession();
  // Один запрос на заход: StrictMode монтирует эффект дважды, а ответ мутации
  // приходит позже, чем второй запуск.
  const asked = useRef(false);

  const existing = sessions.data && demoSessionOf(sessions.data.sessions);
  const created = create.data?.session.id;

  useEffect(() => {
    if (!sessions.data || existing || asked.current) return;
    asked.current = true;
    create.mutate({ startBalance: 10_000, hideDate: false, hidePrice: false, dataSource: 'live' });
  }, [sessions.data, existing, create]);

  const id = existing?.id ?? created;
  if (id)
    return (
      <SessionScreen
        id={id}
        live
        onLeave={() => router.push('/backtest')}
        chartActions={
          connect && (
            <Button tight className="cue" onClick={() => openSettings('exchange')}>
              {t('connectExchange')}
            </Button>
          )
        }
      />
    );

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
