'use client';

import { useTranslations } from 'next-intl';
import type { ProfileOverview } from '@/entities/profile';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { favourite, trend, windowSums } from '../lib/charts';
import { int, signed } from '../lib/format';
import { HIDDEN_GAMES } from '../lib/games';
import { BarSpark, LineSpark } from './Sparkline';

/**
 * Четыре клетки под уровнем: рейтинг, монеты, опыт за неделю и рекорды. Всё —
 * из ответа профиля, своих запросов у клеток нет.
 */
export function StatCells({ profile }: { profile: ProfileOverview }) {
  const t = useTranslations('profile');
  const rating = profile.rating;
  const coins = profile.coinSeries.map((p) => p.balance);
  const xp = profile.xpSeries.map((p) => p.xp);
  const coins30 = trend(coins, 30).abs;
  const week = windowSums(xp, 7);
  const fav = favourite(profile.games, HIDDEN_GAMES);
  const best = profile.records.bestX100;

  return (
    <section className="pf-stats">
      <div className="pf-stat">
        <span className="lbl">{t('rating')}</span>
        <span className="pf-stat-v">{rating ? `#${rating.place}` : '—'}</span>
        {rating ? (
          <>
            <span className="pf-stat-sub">{t('ratingPoints', { n: rating.points })}</span>
            <span className="pf-stat-sub">
              {t('ratingGames', { tournaments: rating.tournaments, wins: rating.wins })}
            </span>
          </>
        ) : (
          <span className="pf-stat-sub is-wrap">{t('ratingNone')}</span>
        )}
      </div>

      <div className="pf-stat">
        <span className="lbl">{t('tileCoins')}</span>
        <span className="pf-stat-v">
          {int(profile.balance)}
          <CoinIcon />
        </span>
        <span className="pf-stat-sub">{t('coins30', { delta: signed(coins30) })}</span>
        <LineSpark values={coins} />
      </div>

      <div className="pf-stat">
        <span className="lbl">{t('xpWeek')}</span>
        <span className="pf-stat-v">
          {signed(week.now)}
          <small>XP</small>
        </span>
        <span className="pf-stat-sub">{t('xpBefore', { xp: int(week.before) })}</span>
        <BarSpark values={xp} recent={7} />
      </div>

      <div className="pf-stat">
        <span className="lbl">{t('records')}</span>
        <dl className="pf-rec">
          <div>
            <dt>{t('recX')}</dt>
            <dd>{best > 0 ? `${(best / 100).toFixed(2)}x` : '—'}</dd>
          </div>
          <div>
            <dt>{t('recStreak')}</dt>
            <dd>{t('days', { days: profile.records.bestStreak })}</dd>
          </div>
          <div>
            <dt>{t('recPeak')}</dt>
            <dd>{int(profile.records.peakBalance)}</dd>
          </div>
          <div>
            <dt>{t('recFav')}</dt>
            <dd>{fav ? t(`game.${fav.id}`) : '—'}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
