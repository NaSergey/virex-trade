'use client';

import { SectionHead } from '@/shared/ui/SectionHead';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import type { AuthorRow, Share } from '../api/types';
import { fmtInt, fmtPct } from '../model/format';
import { VIDEO_1 } from '../model/rules';

const shareText = (x: Share | null) =>
  x == null || x.share == null
    ? '—'
    : `${fmtPct(x.share)} (${fmtPct(x.lo, 0)}–${fmtPct(x.hi, 0)}), n = ${fmtInt(x.n)}`;

const columns: LedgerColumn<AuthorRow>[] = [
  { key: 'label', header: 'Условие', render: (r) => r.label },
  { key: 'author', header: 'Автор', align: 'right', cellClassName: 'n', render: (r) => fmtPct(r.author) },
  {
    key: 'event',
    header: 'BTC, от события',
    align: 'right',
    cellClassName: 'n',
    render: (r) => shareText(r.fromEvent),
  },
  { key: 'base', header: 'Сам рынок', align: 'right', cellClassName: 'n', render: (r) => fmtPct(r.fromEvent.base) },
  {
    key: 'confirm',
    header: 'BTC, от подтверждения',
    align: 'right',
    cellClassName: 'n',
    render: (r) => shareText(r.fromConfirm),
  },
];

/** Статистика автора против BTC: исход — какая граница ±1 ATR задета первой. */
export function AuthorSection({ rows }: { rows: AuthorRow[] }) {
  return (
    <section id="author" className="st-section">
      <SectionHead title="Цифры автора" />
      <p className="muted">
        Автор называет проценты по 88 активам на 1H с 2020 года, не говоря, что считает разворотом (
        <a href={`${VIDEO_1}&t=332s`} target="_blank" rel="noreferrer">
          5:32
        </a>
        ). Здесь — BTC, 1H, с 2018: исход — какая граница ±1 ATR от закрытия задета первой за 24 свечи; обе в одной свече
        или ни одной — в счёт не идёт. «Сам рынок» — тот же тест от каждой свечи: столько даёт BTC без всякого сигнала. В
        скобках — 95 % интервал.
      </p>
      <p className="muted">
        У свипа с условием два столбца. «От события» — исход от закрытия свипа, а условие ждём после: слом вверх «после
        свипа» уже значит, что цена пошла вверх, и процент завышается сам собой — так, по-видимому, считал автор. «От
        подтверждения» — от свечи, на которой условие выполнилось: только это число можно использовать для входа.
      </p>
      <LedgerTable columns={columns} rows={rows} rowKey={(r) => r.key} minWidth={900} />
    </section>
  );
}
