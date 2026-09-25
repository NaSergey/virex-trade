'use client';

import { useTranslations } from 'next-intl';
import type { HandCategory } from '@/entities/game-table';
import { PlayingCard } from '@/widgets/card-table';

/**
 * Пример на каждую категорию — в том же порядке и с теми же названиями, что
 * у крупье (`hands.*`). Первые `used` карт и есть комбинация, остальные —
 * кикеры, они притушены.
 */
const RANKS: { cat: HandCategory; cards: string[]; used: number }[] = [
  { cat: 'straightFlush', cards: ['9h', '8h', '7h', '6h', '5h'], used: 5 },
  { cat: 'quads', cards: ['As', 'Ac', 'Ah', 'Ad', 'Kd'], used: 4 },
  { cat: 'fullHouse', cards: ['Ks', 'Kh', 'Kd', '7c', '7s'], used: 5 },
  { cat: 'flush', cards: ['Ad', 'Jd', '8d', '6d', '3d'], used: 5 },
  { cat: 'straight', cards: ['Tc', '9d', '8h', '7s', '6c'], used: 5 },
  { cat: 'trips', cards: ['Qs', 'Qh', 'Qd', '9c', '4s'], used: 3 },
  { cat: 'twoPair', cards: ['Js', 'Jh', '5c', '5d', 'As'], used: 4 },
  { cat: 'pair', cards: ['Th', 'Tc', 'Ks', '8d', '3c'], used: 2 },
  { cat: 'high', cards: ['Ah', 'Qc', '9s', '6d', '2h'], used: 1 },
];

/**
 * Справка по комбинациям — от старшей к младшей, рука на строку. Без
 * заголовка и своей кнопки закрытия: включается и выключается в меню стола.
 */
export function HandRankings() {
  const t = useTranslations('poker');
  return (
    <aside className="pk-ranks" aria-label={t('ranksToggle')}>
      <ol className="pk-ranks-list">
        {RANKS.map((r) => (
          <li key={r.cat} className="pk-rank-row">
            <span className="pk-rank-name">{t(`hands.${r.cat}`)}</span>
            <span className="pk-rank-cards">
              {r.cards.map((c, i) => (
                <PlayingCard key={c} card={c} size="sm" dim={i >= r.used} />
              ))}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
