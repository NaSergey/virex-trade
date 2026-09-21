'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTournament } from '@/entities/tournament';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Wrap } from '@/shared/ui/Wrap';
import { SessionScreen } from '@/widgets/backtest-session';

/**
 * `/games/trading/<id>` — торговля в турнире, и больше ничего.
 *
 * Раньше по этому адресу стояла страница турнира со всем его содержимым, а
 * терминал разворачивался на ней кнопкой. Турнир теперь показывается ровно
 * одним способом — окном на витрине (см. `TournamentDialog`), и второй формы
 * того же самого в продукте нет: она расходилась бы с окном на каждой правке.
 * Адрес остался тому единственному, чего в окне быть не может, — графику во
 * весь экран.
 *
 * Ссылка-приглашение сюда больше не ведёт: она указывает на витрину
 * (`/games/trading?t=<id>`). Кто попал на этот адрес без своей сессии —
 * приглашённый по старой ссылке, зритель, участник лобби, — уходит туда же:
 * показывать ему пустой терминал не за что.
 */
export function TournamentTerminalPage({ id }: { id: string }) {
  const t = useTranslations('tournaments');
  const router = useRouter();
  const { data, error } = useTournament(id);
  const lobby = `/games/trading?t=${id}`;

  useEffect(() => {
    if (data && !data.sessionId) router.replace(lobby);
  }, [data, lobby, router]);

  if (error)
    return (
      <Wrap page style={{ paddingTop: 'var(--s4)' }}>
        <ErrorNote error={error} fallback={t('loadFailed')} />
      </Wrap>
    );

  // Сессии нет — идёт переход на витрину; заглушка держит место ровно до него.
  if (!data?.sessionId)
    return (
      <Wrap page style={{ paddingTop: 'var(--s4)' }}>
        <Skeleton height={200} />
      </Wrap>
    );

  // Завершённый турнир сессию не отнимает: терминал покажет её итог сам, и
  // выбрасывать отсюда человека, который как раз дочитывает свои сделки, не за
  // что. Из терминала он уходит на витрину — с открытым окном своего турнира.
  return <SessionScreen id={data.sessionId} onLeave={() => router.push(lobby)} />;
}
