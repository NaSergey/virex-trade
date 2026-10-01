'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTournament } from '@/entities/tournament';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { DIALOG_EXIT_MS, Dialog, DialogBody, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { TournamentActions } from './TournamentActions';
import { TournamentBadge } from './TournamentBadge';
import { TournamentView } from './TournamentView';

/**
 * Турнир окном — единственная его форма в продукте.
 *
 * Зачем окно вместо страницы: списки и лидерборд рядом с ними и есть то, ради
 * чего человек зашёл, а в лобби он заглядывает, чтобы решить «входить или
 * нет». Уводя его на отдельную страницу, мы заставляли возвращаться назад
 * после каждого такого взгляда и терять место в списках. Своей страницы у
 * турнира больше нет: ссылка-приглашение ведёт на ту же витрину с адресом
 * `?t=<id>`, и пришедший снаружи видит ровно то же, что и пришедший из списка.
 *
 * `/games/trading/<id>` остался, но это уже не турнир, а терминал: «Торговать»
 * уводит туда, потому что графику нужен весь экран, и в окне от него не
 * осталось бы ничего.
 */
export function TournamentDialog({ open, onClose }: { open: string | null; onClose: () => void }) {
  /**
   * Закрытие двухшаговое, и держать его приходится здесь, а не общим
   * `useDialogFade`: у того окно закрыто, когда закрыто само окно, а здесь
   * оно ещё и смонтировано ровно пока у родителя есть турнир. Родитель
   * снимает турнир по `onClose`, и сообщить ему об этом нужно не раньше, чем
   * окно уйдёт с экрана, иначе содержимое пропадёт первым кадром анимации.
   */
  const [closing, setClosing] = useState(false);
  const close = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, DIALOG_EXIT_MS);
  };

  return (
    <Dialog open={open != null && !closing} onOpenChange={(v) => !v && close()}>
      {/* Содержимое монтируется только с турниром: иначе закрытое окно держало
          бы опрос турнира и ходило за данными в фоне. */}
      {open != null && <Body key={open} id={open} onClose={close} />}
    </Dialog>
  );
}

function Body({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations('tournaments');
  const router = useRouter();
  // Тот же ключ запроса, что и внутри TournamentView, — второго обращения к
  // серверу нет. Нужен здесь только ради имени, состояния и фонда в шапке окна.
  const { data } = useTournament(id);
  const x = data?.tournament;

  return (
    <DialogContent wide tone="game">
      {/* Имя берётся из ответа, и это не гонка: окно монтируется уже с данными
          в кэше (см. useTournamentOpener), пустым оно не бывает. Отдельное имя
          из строки списка держалось здесь, только пока окно открывалось раньше
          данных. Свой заголовок содержимое турнира не рисует вовсе: Radix
          требует Title у окна, и имя читалось бы дважды. */}
      <DialogHeader
        title={x?.name ?? t('loadFailed')}
        subtitle={x && <TournamentBadge status={x.status} startsAt={x.startsAt} long />}
        aside={
          x && (
            <>
              <span className="tpool">
                {x.prizePool} <CoinIcon />
              </span>
              {/* Делить фонд не на кого — значит и говорить не о делении:
                  «фонд делится так — 1: 100%» описывает распределение, которого
                  нет. Разбивка по местам остаётся там, где мест правда
                  несколько. */}
              <span className="tpool-sub">
                {x.format === 'teams'
                  ? t('prizeTeamsShort')
                  : x.payoutShares.length === 1
                    ? t('winnerSingle')
                    : t('sharesSummary', {
                        shares: x.payoutShares.map((s, i) => `${i + 1}: ${s}%`).join(' · '),
                      })}
              </span>
            </>
          )
        }
      />
      <DialogBody>
        <TournamentView id={id} />
      </DialogBody>
      {/* Подвал отдельным узлом, а не последним блоком тела: линейка над
          действиями — это край окна, и рисовать её изнутри содержимого
          значит подделывать рамку. */}
      <TournamentActions id={id} onTrade={() => router.push(`/games/trading/${id}`)} onRemoved={onClose} />
    </DialogContent>
  );
}
