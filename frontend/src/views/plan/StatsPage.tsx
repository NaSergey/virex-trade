'use client';

import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { MetricCell } from '@/shared/ui/MetricCell';
import { PageHead } from '@/shared/ui/PageHead';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Seg } from '@/shared/ui/Seg';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import { usePlanState, useStats } from './api/hooks';
import { DayBars } from './components/DayBars';
import { duration, pct } from './model/time';

const PERIODS = [7, 30, 90] as const;
const decode = (raw: string | null) => {
  const n = Number(raw);
  return (PERIODS as readonly number[]).includes(n) ? n : 7;
};

/**
 * Отчёт: насколько держусь плана. Соблюдение — сделал 1, частично ½, забил,
 * гулял и без ответа — 0; считается только отслеживаемое и только то, чьё время
 * уже прошло или на что уже ответил. Считает сервер — те же числа приходят в
 * вечернем отчёте в Telegram.
 */
export function StatsPage() {
  const [days, setDays] = usePersistentValue<number>('virex.plan.period', decode, 7, String);
  const state = usePlanState();
  const stats = useStats(days);
  const r = stats.data;
  const cats = new Map((state.data?.categories ?? []).map((c) => [c.id, c]));

  return (
    <>
      <PageHead title="Отчёт" lede="Насколько держусь плана: сделал — 1, частично — ½, забил, гулял и без ответа — 0">
        <Seg
          ariaLabel="Период"
          value={days}
          onChange={setDays}
          options={PERIODS.map((p) => ({ value: p, label: `${p} дн` }))}
        />
      </PageHead>
      <ErrorNote error={stats.error} fallback="Не удалось посчитать отчёт" />
      {!r ? (
        <SkeletonLines widths={[100, 100, 60]} />
      ) : r.counted === 0 ? (
        <EmptyState title="Оценивать пока нечего">
          Отчёт появится, когда пройдёт время первого отслеживаемого блока или вы ответите на него.
        </EmptyState>
      ) : (
        <>
          <div className="metrics metrics-4">
            <MetricCell
              label="Соблюдение"
              value={pct(r.score)}
              tone={r.score != null && r.score >= 0.7 ? 'pos' : 'neg'}
              sub={`${r.counted} блоков`}
            />
            <MetricCell label="Отработано" value={duration(r.workedMin)} sub={`из ${duration(r.plannedMin)}`} />
            <MetricCell
              label="Серия"
              hint="Дней подряд с соблюдением от 70 %. Дни без плана серию не рвут."
              value={`${r.streak} дн`}
            />
            <MetricCell
              label="Опоздание"
              hint="Среднее от начала блока до «Сажусь за работу». Пришёл раньше — ноль, а не минус."
              value={r.lateAvg == null ? '—' : `${r.lateAvg} мин`}
            />
          </div>

          <SectionHead title="По дням" />
          <DayBars days={r.byDay} />

          <SectionHead title="Ответы" />
          <ul className="pl-outcomes">
            <li>
              <span className="pos">Сделал</span> {r.done}
            </li>
            <li>
              <span>Частично</span> {r.partial + r.open}
            </li>
            <li>
              <span className="neg">Забил</span> {r.skipped}
            </li>
            <li>
              <span className="muted">Гулял</span> {r.walk}
            </li>
            <li>
              <span className="neg">Без ответа</span> {r.missed}
            </li>
          </ul>

          <SectionHead title="По видам" />
          <table className="pl-cats">
            <thead>
              <tr>
                <th>Вид</th>
                <th>Соблюдение</th>
                <th>Отработано</th>
                <th>Забил / гулял / пропустил</th>
              </tr>
            </thead>
            <tbody>
              {r.byCategory.map((c) => (
                <tr key={c.category}>
                  <td>
                    {cats.get(c.category)?.emoji} {cats.get(c.category)?.label ?? c.category}
                  </td>
                  <td className={c.score != null && c.score >= 0.7 ? 'pos' : 'neg'}>{pct(c.score)}</td>
                  <td>
                    {duration(c.workedMin)} <span className="muted">из {duration(c.plannedMin)}</span>
                  </td>
                  <td className="muted">
                    {c.skipped} / {c.walk} / {c.missed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
