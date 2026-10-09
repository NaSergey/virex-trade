'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { weekdayLabels, WEEKDAY_ORDER } from '@/shared/lib/utils/period';
import { useLocaleControl } from '@/shared/i18n';
import { Seg } from '@/shared/ui/Seg';
import { Skeleton } from '@/shared/ui/Skeleton';
import { localDay, slotIndex, slotKey, slotOf, verdictOf, type Seasonality, type TimeSlot } from '@/entities/market-seasonality';

const hhmm = (minute: number) => {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
/** Средний ход со знаком, как его показывает `verdictOf`: до сотых, у нуля — без знака. */
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;
const sideClass = (dir: 'up' | 'down' | 'mixed' | null) => (dir === 'up' ? 'pos' : dir === 'down' ? 'neg' : 'muted');
const WEEK = 7 * 1440;

interface Row {
  key: number;
  slot: TimeSlot;
  label: string;
}

/**
 * «Когда BTC чаще растёт»: таймфрейм и день недели — и каждый отрезок времени
 * строкой: полоса «зелёное — рост, красное — падение», «рост 58 %» и на сколько
 * свеча в среднем сдвигалась. Вывод — из обоих чисел (`verdictOf`): цветом —
 * когда говорят одно, серым — когда спорят (чаще росла, но падения крупнее).
 * Сверху одной фразой — что было в это время раньше. Время местное: человек
 * смотрит на свои часы, а не на UTC (сервер считает в UTC, сдвиг — здесь).
 *
 * Прежняя карта 7×24 с тоном «силы хода» и порогом значимости снята владельцем
 * 2026-10-08: «ничего не понятно» — человек пришёл узнать, растёт ли рынок в
 * это время чаще, а карта этого числа не показывала.
 */
export function TimeOdds({
  data,
  isLoading,
  period,
}: {
  /** Таймфрейм берётся из ответа: при смене ТФ прежний ответ держится, пока едет новый. */
  data?: Seasonality;
  isLoading?: boolean;
  /** «1 год» / «2 года» — глубина истории, словами для подписей. */
  period: string;
}) {
  const t = useTranslations('market');
  const { locale } = useLocaleControl();
  const DAY = weekdayLabels(locale);

  // «Сейчас» — свои часы раз в минуту: строка текущего времени переезжает сама.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const offset = -new Date(now).getTimezoneOffset();
  const tf = data?.timeframe ?? 60;
  const daily = tf >= 1440;
  // Текущий отрезок — слот сервера, сдвинутый в местное время, а не местные
  // часы, округлённые вниз: у 4ч при UTC+3 отрезки идут с 03:00, 07:00, …
  const nowKey = slotOf(now, tf);
  const nowAt = (((nowKey + offset) % WEEK) + WEEK) % WEEK;
  const [picked, setPicked] = useState<number | null>(null);
  const day = picked ?? Math.floor(nowAt / 1440);

  const listRef = useRef<HTMLDivElement>(null);
  const nowRef = useRef<HTMLDivElement>(null);

  // Строка «сейчас» — в видимой части списка (у 15м строк 96): прокручивается
  // сам список, а не страница.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const row = nowRef.current;
    // Другой день — строки «сейчас» нет, и список начинается сначала, а не с
    // места, где стоял прошлый день.
    list.scrollTop = row ? row.offsetTop - list.offsetTop - list.clientHeight / 2 + row.clientHeight / 2 : 0;
  }, [data, day, tf]);

  if (isLoading) {
    return (
      <div className="to-list" aria-hidden>
        {Array.from({ length: 8 }, (_, i) => (
          <div className="to-row" key={i}>
            <Skeleton as="span" flush height={9} width={72} />
            <span className="to-bar to-bar-empty" />
            <Skeleton as="span" flush height={9} width={80} className="skel-r" />
            <Skeleton as="span" flush height={9} width={44} className="skel-r" />
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.slots.length === 0) return <p className="muted">{t('noData')}</p>;

  const index = slotIndex(data.slots);
  const rows: Row[] = daily
    ? WEEKDAY_ORDER.flatMap((d) => {
        const slot = index.get(slotKey(d, 0));
        return slot ? [{ key: slotKey(d, 0), slot, label: DAY[d] }] : [];
      })
    : localDay(data.slots, day, offset).map(({ slot, start }) => ({
        key: slotKey(slot.weekday, slot.minute),
        slot,
        label: `${hhmm(start)}–${hhmm(start + tf)}`,
      }));

  const current = index.get(nowKey);
  const cv = current ? verdictOf(current) : null;
  const nowWhen = daily
    ? DAY[new Date(now).getUTCDay()]
    : `${DAY[Math.floor(nowAt / 1440)]} ${hhmm(nowAt % 1440)}–${hhmm((nowAt % 1440) + tf)}`;
  const perRow = Math.round(data.totalSamples / data.slots.length);

  return (
    <>
      {current && cv && (
        // «Из скольких» — те же свечи, от которых считан процент: те, что
        // сдвинулись; свеча на месте не рост и не падение.
        <p className="to-now">
          {t(
            !cv.freqDir
              ? 'oddsNowEven'
              : cv.dir === 'mixed'
                ? cv.freqDir === 'up'
                  ? 'oddsNowMixedUp'
                  : 'oddsNowMixedDown'
                : cv.freqDir === 'up'
                  ? 'oddsNowUp'
                  : 'oddsNowDown',
            {
              when: nowWhen,
              pct: cv.pct,
              period,
              count: cv.freqDir === 'down' ? current.downSamples : current.upSamples,
              n: current.upSamples + current.downSamples,
              avg: signed(cv.avg),
            },
          )}
        </p>
      )}

      {!daily && (
        <div className="to-days">
          <Seg
            options={WEEKDAY_ORDER.map((d) => ({ value: d, label: DAY[d] }))}
            value={day}
            onChange={setPicked}
            ariaLabel={t('oddsDayAriaLabel')}
          />
        </div>
      )}

      <div className="to-list" ref={listRef} data-tour="market-weekday">
        {rows.map(({ key, slot, label }) => {
          const isNow = key === nowKey;
          const v = verdictOf(slot);
          const up = v.freqDir === 'down' ? 100 - v.pct : v.pct;
          return (
            <div
              key={key}
              ref={isNow ? nowRef : undefined}
              className={`to-row${isNow ? ' is-now' : ''}`}
              title={t('oddsRowTooltip', {
                when: daily ? label : `${DAY[day]} ${label}`,
                up,
                down: 100 - up,
                change: signed(v.avg),
                n: slot.samples,
              })}
            >
              <span className="to-t">
                {label}
                {isNow && <span className="to-mark">{t('oddsNowMark')}</span>}
              </span>
              <span className="to-bar">
                <i style={{ width: `${slot.upPct.toFixed(1)}%` }} />
              </span>
              <span className={`to-v ${sideClass(v.dir)}`}>
                {v.freqDir === 'up'
                  ? t('oddsUp', { pct: v.pct })
                  : v.freqDir === 'down'
                    ? t('oddsDown', { pct: v.pct })
                    : t('oddsEven')}
              </span>
              <span className={`to-a ${sideClass(v.avg > 0 ? 'up' : v.avg < 0 ? 'down' : null)}`}>
                {signed(v.avg)} %
              </span>
            </div>
          );
        })}
      </div>

      <p className="foot">{t('oddsLegend')}</p>
      {/* Дневная свеча биржи — сутки UTC, а не местные: у кого пояс не нулевой,
          его «понедельник» начинается не в полночь. */}
      {daily && offset !== 0 && <p className="foot">{t('oddsDailyNote', { time: hhmm(offset) })}</p>}
      <p className="foot">{t('oddsNote', { period, n: perRow })}</p>
    </>
  );
}
