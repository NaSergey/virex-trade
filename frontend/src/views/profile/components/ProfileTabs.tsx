'use client';

import { useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import type { ProfileOverview } from '@/entities/profile';
import { Seg } from '@/shared/ui/Seg';
import { PANE_MIN, TABLE_RESERVE, rowsFor, tileCols } from '../lib/fit';
import { useBoxHeight } from '../model/useBoxHeight';
import { useMediaQuery } from '../model/useMediaQuery';
import { AchievementTiles } from './AchievementTiles';
import { FeedPane } from './FeedPane';
import { GamesPane } from './GamesPane';

type Tab = 'games' | 'feed' | 'ach';

/**
 * Окно, в котором профиль стоит карточкой в экран, — то же условие, что у CSS
 * (`.pf-stage`). Уже — колонка на всю ширину и страница листается, и мерить
 * высоту вкладки незачем. Низкое окно этим не выключается: блок вкладки не
 * сжимается меньше `PANE_MIN`, и страница просто чуть листается.
 */
const FITS = '(min-width: 1100px)';

/**
 * Что человек делал — вкладками под клетками. Блок забирает остаток высоты
 * окна, и строк на листе каждой вкладки столько, сколько в него влезает
 * (спека 2026-10-16). Число строк — ключ панели: окно поменяло высоту —
 * панель начинает с первого листа, а не с номера, которого уже нет.
 */
export function ProfileTabs({ profile }: { profile: ProfileOverview }) {
  const t = useTranslations('profile');
  const [tab, setTab] = useState<Tab>('games');
  const [paneRef, height] = useBoxHeight<HTMLDivElement>();
  const fits = useMediaQuery(FITS);
  const h = fits ? height : 0;
  // Пока блок не измерен, содержимого нет: иначе вкладка успела бы нарисовать
  // лист «узкого окна» и тут же — второй, своего размера.
  const measuring = fits && height === 0;

  const options: { value: Tab; label: string }[] = [
    { value: 'games', label: t('tabGames') },
    { value: 'feed', label: t('feed') },
    { value: 'ach', label: t('achievements') },
  ];
  const rows = rowsFor(h, TABLE_RESERVE);

  return (
    <>
      <div className="pf-tabs">
        <Seg options={options} value={tab} onChange={setTab} ariaLabel={t('tabsLabel')} />
      </div>
      <div className="pf-pane" ref={paneRef} style={{ '--pf-pane-min': `${PANE_MIN}px` } as CSSProperties}>
        {!measuring && (
          <>
            {tab === 'games' && <GamesPane key={rows} profile={profile} rows={rows} />}
            {tab === 'feed' && <FeedPane key={rows} feed={profile.feed} rows={rows} />}
            {tab === 'ach' && <AchievementTiles list={profile.achievements} cols={tileCols(h)} />}
          </>
        )}
      </div>
    </>
  );
}
