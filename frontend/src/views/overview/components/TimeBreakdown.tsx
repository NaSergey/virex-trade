'use client';

import type { TimeStatsResponse, TimeBucket } from '@/entities/trade';
import { Lookup, KeyValue } from '@/shared/ui/Lookup';
import { Money } from '@/shared/ui/Money';
import { WEEKDAY_LABELS, WEEKDAY_ORDER } from '@/shared/lib/utils/period';
import { formatMoney } from '@/shared/lib/utils/format';

/** Часы и минуты словами: «3 ч 42 м». */
function fmtDuration(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} ч ${String(m).padStart(2, '0')} м` : `${m} м`;
}

/**
 * Дни недели: столбик записей, а не бар-чарт. Одна строка на день, полоса
 * растёт от центральной риски — влево убыток, вправо прибыль, — и справа стоят
 * оба числа: сумма и винрейт с числом сделок. Знак результата виден формой,
 * величина — цифрой; ни то, ни другое не требует наведения.
 */
export function WeekdayRows({ buckets }: { buckets: TimeBucket[] }) {
  const maxAbs = Math.max(1, ...buckets.map((b) => Math.abs(b?.totalPnl ?? 0)));

  return (
    <div className="wk-list">
      {WEEKDAY_ORDER.map((d) => {
        const b = buckets[d];
        const pnl = b?.totalPnl ?? 0;
        const width = (Math.abs(pnl) / maxAbs) * 50;
        return (
          <div className="wk" key={d}>
            <span className="lbl">{WEEKDAY_LABELS[d]}</span>
            <span className="wk-t">
              <i className="wk-z" />
              {b?.trades ? (
                <i
                  className="wk-f"
                  style={{
                    left: pnl >= 0 ? '50%' : undefined,
                    right: pnl >= 0 ? undefined : '50%',
                    width: `${width.toFixed(1)}%`,
                    background: pnl >= 0 ? 'var(--color-up)' : 'var(--color-down)',
                  }}
                />
              ) : null}
            </span>
            {b?.trades ? <Money value={pnl} className="wk-v" /> : <span className="wk-v">—</span>}
            <span className="wk-s">{b?.trades ? `${b.winRate.toFixed(0)} % · ${b.trades}` : 'нет сделок'}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Часы входа: высота столбика — сколько сделок в этот час, светлая заливка
 * внутри — какая их доля закрылась в плюс. Два разных вопроса («когда я
 * торгую» и «когда у меня получается») живут на одном столбике, поэтому час с
 * тремя сделками и винрейтом 100% нельзя спутать с часом с двадцатью.
 */
export function HourBars({ buckets }: { buckets: TimeBucket[] }) {
  const hours = buckets.length === 24 ? buckets : Array.from({ length: 24 }, () => null);
  const maxTrades = Math.max(1, ...hours.map((b) => b?.trades ?? 0));

  return (
    <>
      <div className="hrs">
        {hours.map((b, h) => (
          <span
            className="hr"
            key={h}
            style={{ height: `${(((b?.trades ?? 0) / maxTrades) * 100).toFixed(0)}%` }}
            title={
              b?.trades
                ? `${String(h).padStart(2, '0')}:00 — ${b.trades} сделок, винрейт ${b.winRate.toFixed(0)} %`
                : `${String(h).padStart(2, '0')}:00 — нет сделок`
            }
          >
            <i style={{ height: '100%' }} />
            <b style={{ height: `${b?.winRate ?? 0}%` }} />
          </span>
        ))}
      </div>
      <div className="hrs-x">
        {hours.map((_, h) => (
          <span key={h}>{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>
        ))}
      </div>
    </>
  );
}

/**
 * Справочные числа периода — список без коробок, по строке на величину.
 *
 * Просадки здесь нет намеренно: её показывает сама кривая — областью, а не
 * числом. Повторять то же число в справке значило бы сказать одно и то же
 * дважды, причём хуже: число не говорит, сколько эта яма длилась.
 */
export function HoldTimes({
  duration,
  peak,
}: {
  duration: TimeStatsResponse['duration'];
  peak?: number;
}) {
  return (
    <Lookup one style={{ marginTop: 'var(--s3)' }}>
      <KeyValue label="Среднее удержание">{fmtDuration(duration.avgHoldMin)}</KeyValue>
      <KeyValue label="У прибыльных" valueClassName="n pos">
        {fmtDuration(duration.avgWinHoldMin)}
      </KeyValue>
      <KeyValue label="У убыточных" valueClassName="n neg">
        {fmtDuration(duration.avgLossHoldMin)}
      </KeyValue>
      {/* Пик кривой не красится знаком: он всегда «сколько было в лучшей точке»,
          а не результат — цвет здесь означал бы то, чего в числе нет. */}
      {peak != null && <KeyValue label="Пик кривой">{formatMoney(peak)}</KeyValue>}
    </Lookup>
  );
}
