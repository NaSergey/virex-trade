'use client';

import { WEEKDAY_LABELS, WEEKDAY_ORDER } from '@/shared/lib/utils/period';
import type { MarketCorrelation } from '../api/market-events-hooks';

/**
 * Доля дней недели, закрывшихся выше открытия, и средний ход.
 *
 * Подпись под таблицей обязательна по смыслу: на выборке в пару сотен дней
 * отклонение от 50 % — намёк, а не закономерность, и без этой оговорки
 * «вторник 57 % рост» читается как торговый сигнал.
 */
export function WeekdayOdds({ corr }: { corr?: MarketCorrelation }) {
  if (!corr || corr.totalDays === 0) {
    return <p className="muted">Нет данных</p>;
  }

  return (
    <>
      {WEEKDAY_ORDER.map((d) => {
        const b = corr.weekday[d];
        const up = (b?.winRateLongPct ?? 0) >= 50;
        return (
          <div className="evt" key={d}>
            <span className="evt-d">{WEEKDAY_LABELS[d]}</span>
            <span className="evt-n n">
              {b?.days ? `${b.winRateLongPct.toFixed(0)} %` : '—'}
              <span className="lbl" style={{ letterSpacing: '.06em' }}>
                {' '}
                рост
              </span>
            </span>
            <span className={`evt-i ${b?.days ? (up ? 'pos' : 'neg') : ''}`}>
              {b?.days ? `${b.avgChangePct >= 0 ? '+' : '−'}${Math.abs(b.avgChangePct).toFixed(2)} %` : ''}
            </span>
          </div>
        );
      })}
      <p className="foot">
        Доля дней, закрывшихся выше открытия, и средний ход за {corr.totalDays} дней. Отклонение от 50 % на
        такой выборке — намёк, а не закономерность.
      </p>
    </>
  );
}
