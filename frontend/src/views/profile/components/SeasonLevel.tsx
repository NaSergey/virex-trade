'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ProfileSeason } from '@/entities/profile';
import { useLocaleControl } from '@/shared/i18n';
import { dateFormat } from '@/shared/lib/utils/intl';
import { int } from '../lib/format';

const DAY_MS = 86_400_000;

/**
 * Уровень сезона: число, полоса до следующего уровня и сроки. Конец сезона —
 * последний его миг по UTC (`seasonBounds`), поэтому и дата печатается по UTC:
 * в поясе браузера 31 декабря могло бы стать 1 января.
 */
export function SeasonLevel({ season }: { season: ProfileSeason }) {
  const t = useTranslations('profile');
  const { locale } = useLocaleControl();
  const intlLocale = locale === 'en' ? 'en-US' : 'ru-RU';
  const need = season.xpIntoLevel + season.xpToNext;
  const maxed = season.xpToNext === 0;
  const pct = maxed || need === 0 ? 100 : (season.xpIntoLevel / need) * 100;
  const ends = new Date(season.endsAt);
  const date = dateFormat(intlLocale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(ends)
    .replace('.', '');
  // «Сейчас» — один раз на монтирование: дни до конца сезона не идут, пока
  // на профиль смотрят, а чтение часов в рендере правило чистоты запрещает.
  const [now] = useState(Date.now);
  const days = Math.max(0, Math.ceil((ends.getTime() - now) / DAY_MS));

  return (
    <section className="pf-lvl" aria-label={t('level', { level: season.level })}>
      <div className="pf-lvl-n">
        <span className="lbl">{t('levelLabel')}</span>
        {season.level}
      </div>
      <div className="pf-bar" role="presentation">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="pf-lvl-meta">
        <span>
          {maxed ? (
            t('maxed')
          ) : (
            <>
              <b>{t('xpInto', { into: int(season.xpIntoLevel), need: int(need) })}</b>
              {' · '}
              {t('toNext', { xp: int(season.xpToNext), level: season.level + 1 })}
              {' · '}
              {t('seasonXp', { xp: int(season.xp) })}
            </>
          )}
        </span>
        <span>{t('seasonLine', { key: season.key, date, days })}</span>
      </div>
    </section>
  );
}
