'use client';

import { useTranslations } from 'next-intl';
import { GAMES } from '../model/games';

/**
 * Полоса, которой раздел заканчивается: сколько игр, сколько способов играть и
 * что это одно сообщество на все игры.
 *
 * Число игр берётся из самого каталога, а не написано словом: список меняется
 * записью в `model/games.ts`, и подпись, которую придётся править отдельно,
 * однажды разойдётся со списком выше на этой же странице.
 */
export function StatsBar() {
  const t = useTranslations('games');
  return (
    <section className="gstats">
      <div>
        <b>{GAMES.length}</b>
        <span>{t('stats.games')}</span>
      </div>
      <div>
        <b>∞</b>
        <span>{t('stats.options')}</span>
      </div>
      <div>
        <b>{t('stats.communityN')}</b>
        <span>{t('stats.community')}</span>
      </div>
      <div className="gstats-brand">
        <b>TRADE PLAY</b>
        <span>{t('stats.slogan')}</span>
      </div>
    </section>
  );
}
