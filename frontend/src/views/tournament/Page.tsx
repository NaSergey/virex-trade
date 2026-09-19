'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCoinBalance } from '@/entities/coins';
import {
  useJoinTournament,
  useLeaveTournament,
  useRemoveTournament,
  useStartTournament,
  useTournament,
} from '@/entities/tournament';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Wrap } from '@/shared/ui/Wrap';
import { SessionScreen } from '@/widgets/backtest-session';
import { InviteLink } from './components/InviteLink';
import { Participants } from './components/Participants';
import { TournamentHead } from './components/TournamentHead';
import { Winners } from './components/Winners';

/**
 * Страница турнира. Три состояния, и у каждого свой смысл:
 *
 * - **лобби** — ссылка-приглашение, состав и вход; играть ещё не во что;
 * - **идёт** — «Торговать» открывает терминал его сессии прямо здесь, как в
 *   бектесте: второго терминала в продукте нет;
 * - **завершён** — призёры и свой результат.
 */
export function TournamentPage({ id }: { id: string }) {
  const t = useTranslations('tournaments');
  const tc = useTranslations('coins');
  const router = useRouter();
  const { data, error } = useTournament(id);
  const { data: coins } = useCoinBalance();
  const [trading, setTrading] = useState(false);

  const join = useJoinTournament(id);
  const leave = useLeaveTournament(id);
  const start = useStartTournament(id);
  const remove = useRemoveTournament(id);

  if (error)
    return (
      <Wrap page>
        <ErrorNote error={error} fallback={t('loadFailed')} />
      </Wrap>
    );
  if (!data)
    return (
      <Wrap page>
        <Skeleton height={200} />
      </Wrap>
    );

  const { tournament: x } = data;
  const lobby = x.status === 'lobby';
  const running = x.status === 'running';

  // Терминал во всю ширину окна, без читательской колонки — как в бектесте.
  if (trading && running && data.sessionId) {
    return <SessionScreen id={data.sessionId} onLeave={() => setTrading(false)} />;
  }

  const canStart = data.isCreator && lobby && x.players > x.winnersCount;
  const notEnoughCoins = coins != null && x.entryFee > coins.balance;
  const pending = join.isPending || leave.isPending || start.isPending || remove.isPending;

  return (
    <Wrap page style={{ paddingTop: 'var(--s4)' }}>
      <TournamentHead detail={data} />

      {lobby && data.isParticipant && <InviteLink id={id} />}

      <div className="order-actions" style={{ marginTop: 'var(--s4)', flexWrap: 'wrap' }}>
        {lobby && !data.isParticipant && (
          <Button variant="solid" disabled={pending || notEnoughCoins} onClick={() => join.mutate()}>
            {x.entryFee > 0 ? t('joinFor', { n: x.entryFee, unit: tc('unit') }) : t('joinFree')}
          </Button>
        )}
        {lobby && data.isParticipant && !data.isCreator && (
          <Button disabled={pending} onClick={() => leave.mutate()}>
            {t('leave')}
          </Button>
        )}
        {data.isCreator && lobby && (
          <>
            <Button variant="solid" disabled={!canStart || pending} onClick={() => start.mutate()}>
              {t('start')}
            </Button>
            <Button
              variant="risk"
              disabled={pending}
              onClick={() => remove.mutate(undefined, { onSuccess: () => router.push('/tournaments/trading') })}
            >
              {t('remove')}
            </Button>
          </>
        )}
        {running && data.sessionId && (
          <Button variant="solid" onClick={() => setTrading(true)}>
            {t('trade')}
          </Button>
        )}
      </div>

      {/* Почему кнопка старта неактивна, должно быть видно без догадок. */}
      {data.isCreator && lobby && !canStart && <p className="muted">{t('needMorePlayers')}</p>}
      {lobby && !data.isParticipant && notEnoughCoins && (
        <p className="neg">{t('notEnoughCoins', { n: x.entryFee, unit: tc('unit') })}</p>
      )}
      <ErrorNote error={join.error ?? leave.error ?? start.error ?? remove.error} fallback={t('actionFailed')} />

      {x.status === 'finished' ? <Winners detail={data} /> : <Participants detail={data} />}
    </Wrap>
  );
}
