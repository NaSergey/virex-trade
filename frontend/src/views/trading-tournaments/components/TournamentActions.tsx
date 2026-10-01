'use client';

import { useTranslations } from 'next-intl';
import { useCoinBalance } from '@/entities/coins';
import {
  useFinishTournament,
  useJoinTournament,
  useLeaveTournament,
  useRemoveTournament,
  useSetReady,
  useTournament,
} from '@/entities/tournament';
import { useAuth } from '@/features/auth';
import { formatTradeDate } from '@/shared/lib/utils/format';
import { Button } from '@/shared/ui/Button';
import { DialogFooter } from '@/shared/ui/dialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { TEAM_NAMES } from '../lib/teams';

/**
 * Всё, что можно сделать с турниром, — подвалом окна, как у остальных окон
 * продукта: действия за линейкой, а не посреди содержимого. В теле они стояли
 * между условиями турнира и его составом и разрывали чтение ровно там, где
 * человек ещё разбирается, входить ли.
 *
 * Отдельным компонентом от `TournamentView`, потому что подвал окна — это
 * другой узел разметки, а не другое место внутри того же. Второго обращения к
 * серверу это не стоит: `useTournament` здесь тот же ключ запроса, что и в
 * теле, ответ берётся из кэша.
 *
 * Слева — почему кнопка не сработает и что она сделает, справа сами кнопки.
 * Подписи обязаны стоять рядом с действием: человек нажал «готов» и вправе
 * знать, почему ничего не произошло.
 */
export function TournamentActions({
  id,
  onTrade,
  onRemoved,
}: {
  /** Нажали «Торговать» — окно уводит на страницу терминала. */
  onTrade: (sessionId: string) => void;
  /** Турнир удалён — показывать больше нечего. */
  onRemoved: () => void;
  id: string;
}) {
  const t = useTranslations('tournaments');
  const tc = useTranslations('coins');
  const { data } = useTournament(id);
  const { data: coins } = useCoinBalance();
  const { user } = useAuth();

  const join = useJoinTournament(id);
  const leave = useLeaveTournament(id);
  const ready = useSetReady(id);
  const remove = useRemoveTournament(id);
  const finish = useFinishTournament(id);

  if (!data) return null;

  const { tournament: x } = data;
  const lobby = x.status === 'lobby';
  const running = x.status === 'running';
  // Турнир по времени стартует сам: готовности у него нет, и подписи о ней
  // тоже — только когда он начнётся.
  const scheduled = lobby && x.startsAt != null;

  const teams = x.format === 'teams';
  const inTeam = (team: number) => data.participants.filter((p) => p.team === team).length;

  // Стартует не человек, а состояние лобби: когда готовы все и делить фонд
  // есть на кого (у команд — когда в каждой хотя бы один). Кнопки «Начать» в
  // продукте нет — см. TournamentsService.setReady.
  const enoughPlayers = teams ? inTeam(0) > 0 && inTeam(1) > 0 : x.players > x.winnersCount;
  const readyCount = data.participants.filter((p) => p.ready).length;
  const iAmReady = data.me?.ready ?? false;
  // Право на досрочный финал шире остальных — ещё и у владельца сервиса, чтобы
  // было чем разобрать зависший турнир. Решает всё равно бэкенд, флаг здесь
  // только чтобы не показывать кнопку, которая заведомо ответит 403.
  const canFinish = running && (data.isCreator || !!user?.isAdmin);
  const notEnoughCoins = coins != null && x.entryFee > coins.balance;
  const pending =
    join.isPending || leave.isPending || ready.isPending || remove.isPending || finish.isPending;
  // Войти можно только в набор (решение владельца 2026-09-27): в начавшийся
  // турнир входа нет.
  const canJoin = lobby && !data.isParticipant && x.players < x.maxPlayers;
  const teamOpen = (team: number) => x.teamSize != null && inTeam(team) < x.teamSize;
  const canTrade = running && data.sessionId != null;
  const canRemove = data.isCreator && !running;
  const hasActions = canJoin || (lobby && data.isParticipant) || canTrade || canFinish || canRemove;
  const error = join.error ?? leave.error ?? ready.error ?? remove.error ?? finish.error;

  // Подвала нет вовсе, когда делать нечего: у завершённого турнира и у зрителя
  // заполненного идущего нет ни одной кнопки, а пустая полоса с линейкой
  // читалась бы обрезанным окном.
  if (!hasActions && error == null) return null;

  return (
    <DialogFooter className="tfoot">
      <div className="tfoot-note">
        {/* Нехватка игроков против числа призовых мест — причина сильнее
            неготовности: пока их мало, готовность всех ничего не даст. */}
        {scheduled && data.isParticipant && (
          <p className="muted">{t('startsAtNote', { date: formatTradeDate(x.startsAt!) })}</p>
        )}
        {lobby && !scheduled && data.isParticipant && !enoughPlayers && (
          <p className="muted">{teams ? t('needBothTeams') : t('needMorePlayers')}</p>
        )}
        {lobby && !scheduled && data.isParticipant && enoughPlayers && readyCount < x.players && (
          <p className="muted">{t('waitingOthers', { ready: readyCount, players: x.players })}</p>
        )}
        {/* У команд кнопки называют команду, и сумма взноса уходит сюда. */}
        {canJoin && teams && x.entryFee > 0 && !notEnoughCoins && (
          <p className="muted">{t('teamJoinFee', { n: x.entryFee, unit: tc('unit') })}</p>
        )}
        {canJoin && notEnoughCoins && (
          <p className="neg">{t('notEnoughCoins', { n: x.entryFee, unit: tc('unit') })}</p>
        )}
        {/* Досрочный финал необратим и считает места по текущему моменту — про
            это надо сказать до нажатия, а не после. */}
        {canFinish && <p className="muted">{t('finishNowHint')}</p>}
        <ErrorNote error={error} fallback={t('actionFailed')} />
      </div>

      {hasActions && (
        <div className="tacts">
          {canJoin && !teams && (
            <Button variant="solid" disabled={pending || notEnoughCoins} onClick={() => join.mutate(undefined)}>
              {x.entryFee > 0 ? t('joinFor', { n: x.entryFee, unit: tc('unit') }) : t('joinFree')}
            </Button>
          )}
          {/* Командный турнир: игрок сам выбирает сторону (решение владельца
              2026-09-27); полная команда кнопку гасит. */}
          {canJoin &&
            teams &&
            [0, 1].map((team) => (
              <Button
                key={team}
                variant="solid"
                disabled={pending || notEnoughCoins || !teamOpen(team)}
                onClick={() => join.mutate(team)}
              >
                {t('joinTeam', { team: TEAM_NAMES[team] })}
              </Button>
            ))}
          {/* Готовность — у любого участника, включая создателя: он такой же
              игрок, и особого права начать у него больше нет. Отмеченная
              готовность снимает заливку, но не рамку: `bare` рядом с «Выйти»
              читался подписью, а не кнопкой, которую можно нажать. */}
          {lobby && !scheduled && data.isParticipant && (
            <Button
              variant={iAmReady ? 'default' : 'solid'}
              disabled={pending}
              onClick={() => ready.mutate(!iAmReady)}
            >
              {iAmReady ? t('notReadyAction') : t('readyAction')}
            </Button>
          )}
          {lobby && data.isParticipant && !data.isCreator && (
            <Button disabled={pending} onClick={() => leave.mutate()}>
              {t('leave')}
            </Button>
          )}
          {/* Удалить — всё, кроме идущего: у того незакрытые сессии, и для
              него есть «Завершить». Из строки таблицы кнопки создателя ушли
              сюда (решение владельца 2026-09-26): в строке одна кнопка. */}
          {canRemove && (
            <Button
              variant="risk"
              disabled={pending}
              onClick={() => remove.mutate(undefined, { onSuccess: onRemoved })}
            >
              {t('remove')}
            </Button>
          )}
          {canTrade && (
            <Button variant="solid" onClick={() => onTrade(data.sessionId!)}>
              {t('trade')}
            </Button>
          )}
          {canFinish && (
            <Button variant="risk" disabled={pending} onClick={() => finish.mutate()}>
              {t('finishNow')}
            </Button>
          )}
        </div>
      )}
    </DialogFooter>
  );
}
