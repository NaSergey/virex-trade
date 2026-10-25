'use client';

import { useTranslations } from 'next-intl';
import type { TagOdds } from '../lib/odds';

const TONE = { plus: 'pos', minus: 'neg', unclear: 'muted' } as const;

/** «41 % · нужно 38 % · 22 сд. · не ясно» — у тега в окне разметки, когда индикатор включён. */
export function TagOddsLine({ odds }: { odds: TagOdds }) {
  const t = useTranslations('tags');
  return (
    <span className={`pick-odds ${TONE[odds.verdict]}`}>
      {t('odds.line', { win: Math.round(odds.winRate), need: Math.round(odds.need), n: odds.n })} · {t(`odds.${odds.verdict}`)}
    </span>
  );
}
