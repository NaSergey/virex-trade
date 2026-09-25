'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/features/auth';
import { Button } from '@/shared/ui/Button';
import { Wrap } from '@/shared/ui/Wrap';
import { ContestBanner } from './components/ContestBanner';
import { CreateTournamentDialog } from './components/CreateTournamentDialog';
import { PublicTournaments } from './components/PublicTournaments';
import { Rating } from './components/Rating';
import { TournamentDialog } from './components/TournamentDialog';
import { TournamentsList } from './components/TournamentsList';
import { useTournamentOpener } from './model/useTournamentOpener';

/**
 * Соревнование в торговле — страница игры, а не всего раздела: витрина игр
 * живёт на `/games`, и рядом с этой игрой со временем встанут другие.
 *
 * Слева — турниры: мои и открытые чужие. Справа — лидерборд игры: он про всю
 * игру, а не про конкретный турнир, и стоит рядом со списками, а не под ними,
 * потому что отвечает на вопрос «с кем я играю», который возникает раньше,
 * чем человек выберет лобби.
 *
 * Создание турнира — кнопка у заголовка и окно за ней: одиннадцать полей формы
 * нужны раз на турнир, а списки читают каждый заход.
 */
export function TradingTournamentsPage() {
  const t = useTranslations('tournaments');
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  // Турнир открывается окном поверх списков, а не переходом: см. TournamentDialog.
  // Окно ждёт свои данные и монтируется уже с ними — см. useTournamentOpener.
  const { open, openingId, openTournament, warmTournament, closeTournament } = useTournamentOpener();

  return (
    <>
      <ContestBanner title={t('tradingTitle')} lede={t('tradingLede')}>
        <Button variant="solid" onClick={() => setCreateOpen(true)}>
          {t('createAction')}
        </Button>
      </ContestBanner>
      <Wrap page style={{ paddingTop: 'var(--s4)' }}>
        <div className="asym bare">
          <div>
            <TournamentsList onOpen={openTournament} onPreload={warmTournament} openingId={openingId} />
            <PublicTournaments onOpen={openTournament} onPreload={warmTournament} openingId={openingId} />
          </div>
          <div className="marg">
            <Rating viewerId={user?.id} />
          </div>
        </div>
        <CreateTournamentDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          // Созданный турнир сразу открывается окном — тем же, каким его
          // открывают из списка: уводить со страницы ради лобби незачем.
          onCreated={openTournament}
        />
        <TournamentDialog open={open} onClose={closeTournament} />
      </Wrap>
    </>
  );
}
