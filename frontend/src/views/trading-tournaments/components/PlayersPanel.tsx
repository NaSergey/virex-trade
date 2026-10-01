'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Seg, type SegOption } from '@/shared/ui/Seg';
import { Rating } from './Rating';
import { TradesFeed } from './TradesFeed';

type Tab = 'rating' | 'trades';

/**
 * Панель игроков справа от списков турниров: «Рейтинг игроков» и «Сделки
 * игроков» (решение владельца 2026-09-26). Вкладки стоят на месте заголовка —
 * их названия и есть заголовки, и третья надпись над ними повторяла бы одну
 * из двух.
 *
 * Содержимое вкладки монтируется только на ней: лента опрашивает сервер раз
 * в несколько секунд, и за скрытой вкладкой этот опрос никому не нужен.
 */
export function PlayersPanel({
  viewerId,
  onOpen,
}: {
  viewerId: string | undefined;
  /** Строка ленты открывает окно своего турнира. */
  onOpen: (tournamentId: string) => void;
}) {
  const t = useTranslations('tournaments');
  // Сделки — первая вкладка и открыты сразу (решение владельца 2026-09-27):
  // живое происходящее интереснее итогов прошлых турниров.
  const [tab, setTab] = useState<Tab>('trades');

  const tabs: SegOption<Tab>[] = [
    { value: 'trades', label: t('panelTabTrades') },
    { value: 'rating', label: t('panelTabRating') },
  ];

  return (
    <section>
      <Seg
        className="ptabs"
        options={tabs}
        value={tab}
        onChange={setTab}
        ariaLabel={`${t('panelTabTrades')} / ${t('panelTabRating')}`}
      />
      {tab === 'rating' ? <Rating viewerId={viewerId} /> : <TradesFeed onOpen={onOpen} />}
    </section>
  );
}
