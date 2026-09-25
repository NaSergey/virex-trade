'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { DealerLine } from '../lib/events';

/**
 * Что говорит крупье покера. Очередь реплик и строка — общие у столов
 * (`DealerSay`), слова — свои у каждой игры.
 */
export function usePokerSay(): (line: DealerLine) => string {
  const t = useTranslations('poker');
  const tc = useTranslations('cardTable');
  return useCallback(
    (l: DealerLine) => {
      const name = l.name ?? (l.seat != null ? tc('player', { n: l.seat + 1 }) : '');
      const amount = (l.amount ?? 0).toLocaleString();
      switch (l.key) {
        case 'wins':
          return l.category
            ? t('dealer.winsWith', { name, amount, hand: t(`hands.${l.category}`) })
            : t('dealer.wins', { name, amount });
        case 'allIn':
        case 'left':
          return t(`dealer.${l.key}`, { name });
        default:
          return t(`dealer.${l.key}`);
      }
    },
    [t, tc],
  );
}
