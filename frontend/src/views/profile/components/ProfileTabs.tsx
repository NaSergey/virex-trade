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
import { PositionsPane } from './PositionsPane';
import { TradesPane } from './TradesPane';

type Tab = 'games' | 'exchange' | 'positions' | 'feed' | 'ach';

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
 *
 * «Открытые позиции» и «Сделки на бирже» — только когда есть что показать и
 * показ открыт (признаки в ответе профиля); позиции — первой вкладкой.
 */
export function ProfileTabs({ profile }: { profile: ProfileOverview }) {
  const t = useTranslations('profile');
  // null — человек ещё не выбирал: открыта первая вкладка списка.
  const [tab, setTab] = useState<Tab | null>(null);
  const [paneRef, height] = useBoxHeight<HTMLDivElement>();
  const fits = useMediaQuery(FITS);
  const h = fits ? height : 0;
  // Пока блок не измерен, содержимого нет: иначе вкладка сделок успела бы
  // спросить лист «узкого окна» и тут же — второй, своего размера.
  const measuring = fits && height === 0;

  // Открытые позиции — первыми и открыты при заходе (владелец 2026-10-16):
  // что человек держит прямо сейчас, интереснее его истории.
  const options: { value: Tab; label: string }[] = [
    ...(profile.hasOpenPositions ? [{ value: 'positions' as Tab, label: t('tabPositions') }] : []),
    { value: 'games', label: t('tabGames') },
    ...(profile.hasExchangeTrades ? [{ value: 'exchange' as Tab, label: t('tabExchange') }] : []),
    { value: 'feed', label: t('feed') },
    { value: 'ach', label: t('achievements') },
  ];
  const shown: Tab = options.find((o) => o.value === tab)?.value ?? options[0].value;
  const rows = rowsFor(h, TABLE_RESERVE);
  const userId = profile.user.id;

  return (
    <>
      <div className="pf-tabs">
        <Seg options={options} value={shown} onChange={setTab} ariaLabel={t('tabsLabel')} />
      </div>
      <div className="pf-pane" ref={paneRef} style={{ '--pf-pane-min': `${PANE_MIN}px` } as CSSProperties}>
        {!measuring && (
          <>
            {shown === 'games' && <GamesPane key={rows} profile={profile} rows={rows} />}
            {shown === 'exchange' && <TradesPane key={rows} userId={userId} rows={rows} />}
            {shown === 'positions' && <PositionsPane key={rows} userId={userId} rows={rows} />}
            {shown === 'feed' && <FeedPane key={rows} feed={profile.feed} rows={rows} />}
            {shown === 'ach' && <AchievementTiles list={profile.achievements} cols={tileCols(h)} />}
          </>
        )}
      </div>
    </>
  );
}
