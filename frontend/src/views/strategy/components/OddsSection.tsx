'use client';

import { SectionHead } from '@/shared/ui/SectionHead';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import type { OddsBlock, OddsSide } from '../api/types';
import { fmtInt, fmtPct, fmtR, tone } from '../model/format';

interface SideRow {
  key: string;
  label: string;
  s: OddsSide;
}

type Count = 'considered' | 'taken' | 'skipped' | 'unjudged';

const num = (key: Count, header: string): LedgerColumn<SideRow> => ({
  key,
  header,
  align: 'right',
  cellClassName: 'n',
  render: (r) => fmtInt(r.s[key]),
});

const columns: LedgerColumn<SideRow>[] = [
  { key: 'label', header: 'Сторона', render: (r) => r.label },
  num('considered', 'Рассмотрено'),
  num('taken', 'Взято'),
  num('skipped', 'Пропущено'),
  num('unjudged', 'Без оценки'),
  { key: 'wr', header: 'Винрейт', align: 'right', cellClassName: 'n', render: (r) => fmtPct(r.s.summary.winrate) },
  {
    key: 'exp',
    header: 'Мат ожидание',
    align: 'right',
    cellClassName: 'n',
    render: (r) => <span className={tone(r.s.summary.expectancy)}>{fmtR(r.s.summary.expectancy)}</span>,
  },
  {
    key: 'sum',
    header: 'Итог',
    align: 'right',
    cellClassName: 'n',
    render: (r) => <span className={tone(r.s.summary.sumR)}>{fmtR(r.s.summary.sumR)}</span>,
  },
];

function verdict(b: OddsBlock, expectancy: number): string {
  const e = b.effect;
  if (e.n === 0) return 'Ни один шорт ещё не пропущен.';
  if (e.mean == null) return `Пропущено ${e.n} шортов — для вывода мало.`;
  const range = `${e.n} шортов, средний R ${fmtR(e.mean)}, 95 % интервал ${fmtR(e.lo)} … ${fmtR(e.hi)}`;
  if (e.verdict === 'helped') {
    const still = expectancy < 0 ? ' Но и взятые сделки в минусе: перевеса нет ни у одной стороны.' : '';
    return `Отбор помог: пропущенные шорты в среднем теряли (${range}).${still}`;
  }
  if (e.verdict === 'hurt') return `Отбор вредит: пропущенные шорты были прибыльными (${range}).`;
  return `Эффект не доказан: пропущенные шорты в пределах шума (${range}).`;
}

/** Лонги и шорты: сделки и винрейт каждой стороны, отбор шортов по вероятности и квоте. */
export function OddsSection({ block, expectancy }: { block: OddsBlock; expectancy: number }) {
  return (
    <section id="odds" className="st-section">
      <SectionHead title="Лонги и шорты" />
      <p className="muted">
        Лонги берутся все. Шорт — только если шортов среди взятых сделок не станет больше 30 % и его вероятность не
        ниже, чем у всех прошлых шортов. Вероятность есть у каждой сделки: доля прибыльных среди прошлых сделок той же
        стороны с той же дневной структурой, закрытых до решения (меньше 30 — все прошлые этой стороны). Пока прошлых
        сделок стороны меньше 30, оценки нет.
      </p>
      <p className="st-verdict">
        {verdict(block, expectancy)} Доля лонгов среди взятых — {fmtPct(block.longShare, 0)}.
      </p>
      <LedgerTable
        columns={columns}
        rows={[
          { key: 'long', label: 'Лонги', s: block.long },
          { key: 'short', label: 'Шорты', s: block.short },
        ]}
        rowKey={(r) => r.key}
        minWidth={760}
      />
    </section>
  );
}
