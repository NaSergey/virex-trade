'use client';

import { SectionHead } from '@/shared/ui/SectionHead';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import type { OddsBlock, OddsSide } from '../api/types';
import { fmtInt, fmtPct, fmtR } from '../model/format';

interface SideRow {
  key: string;
  label: string;
  s: OddsSide;
}

const num = (key: keyof OddsSide, header: string): LedgerColumn<SideRow> => ({
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
];

function verdict(b: OddsBlock, expectancy: number): string {
  const e = b.effect;
  if (e.n === 0) return 'Фильтр ещё не пропустил ни одной сделки.';
  if (e.mean == null) return `Пропущено ${e.n} сделок — для вывода мало.`;
  const range = `${e.n} сделок, средний R ${fmtR(e.mean)}, 95 % интервал ${fmtR(e.lo)} … ${fmtR(e.hi)}`;
  if (e.verdict === 'helped') {
    const still = expectancy < 0 ? ' Но и взятые сделки в минусе: у стратегии нет стороны с перевесом.' : '';
    return `Фильтр помог: пропущенные сделки в среднем теряли (${range}).${still}`;
  }
  if (e.verdict === 'hurt') return `Фильтр вредит: пропущенные сделки были прибыльными (${range}).`;
  return `Эффект не доказан: пропущенные сделки в пределах шума (${range}).`;
}

/** Фильтр по вероятности успеха: правило одно для лонгов и шортов, перекос даёт сама оценка. */
export function OddsSection({ block, expectancy }: { block: OddsBlock; expectancy: number }) {
  return (
    <section id="odds" className="st-section">
      <SectionHead title="Фильтр по вероятности" />
      <p className="muted">
        У каждой сделки на свече подтверждения — доля прибыльных среди прошлых сделок той же стороны с той же дневной
        структурой, закрытых до решения (меньше 30 — все прошлые этой стороны), против их безубыточного винрейта. Ниже —
        сделка пропускается. Пока прошлых сделок меньше 30, сделка берётся без оценки.
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
      />
    </section>
  );
}
