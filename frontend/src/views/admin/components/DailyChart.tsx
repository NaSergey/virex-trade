'use client';

import { useTranslations } from 'next-intl';
import { useLocaleControl } from '@/shared/i18n';
import type { AdminOverview } from '../api/hooks';

// Холст в своих единицах, ширина тянется листом: u = W / boxW — тот же приём,
// что у остальных графиков продукта, иначе на телефоне столбики сжимаются в
// нечитаемую гребёнку.
const H = 96;
const GAP = 2;

/**
 * Сколько разных людей заходило в каждый из дней окна.
 *
 * Именно люди, а не обращения: обращений больше у того, кто дольше держал
 * вкладку открытой, и по ним нельзя отличить двух зашедших от одного
 * засидевшегося. Полная сводка дня — в подсказке столбика.
 */
export function DailyChart({ daily }: { daily: AdminOverview['daily'] }) {
  const t = useTranslations('admin');
  const { locale } = useLocaleControl();
  const intlLocale = locale === 'en' ? 'en-US' : 'ru-RU';

  if (daily.length === 0) return null;

  const max = Math.max(1, ...daily.map((d) => d.activeUsers));
  const W = daily.length * 10;
  const barW = Math.max(1, W / daily.length - GAP);

  const label = (iso: string) =>
    new Date(iso).toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' }).replace('.', '');

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height={H}
        role="img"
        aria-label={t('chartAria')}
        style={{ display: 'block' }}
      >
        {daily.map((d, i) => {
          const h = (d.activeUsers / max) * H;
          return (
            <rect
              key={d.date}
              x={i * (W / daily.length)}
              y={H - h}
              width={barW}
              height={h}
              fill="var(--ink)"
              opacity={d.activeUsers ? 0.85 : 0}
            >
              <title>
                {`${label(d.date)} · ${t('tipUsers', { n: d.activeUsers })} · ${t('tipVisits', {
                  n: d.visits,
                })} · ${t('tipActions', { n: d.actions })}`}
              </title>
            </rect>
          );
        })}
      </svg>

      {/* Подписаны только края: под каждым столбиком даты не помещаются, а
          середина и так читается по положению. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--s1)' }}>
        <span className="lbl">{label(daily[0].date)}</span>
        <span className="lbl">{t('maxPerDay', { n: max })}</span>
        <span className="lbl">{label(daily[daily.length - 1].date)}</span>
      </div>
    </div>
  );
}
