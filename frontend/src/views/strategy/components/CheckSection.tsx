'use client';

import { SectionHead } from '@/shared/ui/SectionHead';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { fmtInt, fmtPct, fmtR, tone } from '../model/format';
import { COINS, PLACEBO, type CoinRow } from '../model/check';

const columns: LedgerColumn<CoinRow>[] = [
  { key: 'coin', header: 'Монета', render: (c) => c.coin },
  { key: 'n', header: 'Сделок за 2 года', align: 'right', cellClassName: 'n', render: (c) => fmtInt(c.n) },
  { key: 'wr', header: 'Винрейт', align: 'right', cellClassName: 'n', render: (c) => fmtPct(c.winrate) },
  {
    key: 'exp',
    header: 'Мат ожидание',
    align: 'right',
    cellClassName: 'n',
    render: (c) => <span className={tone(c.expectancy)}>{fmtR(c.expectancy)}</span>,
  },
  {
    key: 'sum',
    header: 'Итог',
    align: 'right',
    cellClassName: 'n',
    render: (c) => <span className={tone(c.sumR)}>{fmtR(c.sumR)}</span>,
  },
  {
    key: 'all',
    header: 'С 2018 года',
    align: 'right',
    cellClassName: 'n',
    render: (c) => (
      <>
        <span className={tone(c.allExpectancy)}>{fmtR(c.allExpectancy)}</span>{' '}
        <span className="muted">· {fmtInt(c.allN)}</span>
      </>
    ),
  },
];

/** Повторяется ли результат BTC: то же правило без правок на других монетах. */
export function CheckSection() {
  return (
    <section id="check" className="st-section">
      <SectionHead title="Проверка на других монетах" />
      <p className="muted">
        Снимок от 31.10.2026, правила те же, без единой правки. Случайный вход с теми же сторонами и стопами на BTC и ETH ни
        разу из {PLACEBO.runs} прогонов не обогнал стратегию. Это не доказательство: монеты движутся вместе, сделок мало, а
        проскальзывание не учтено.
      </p>
      <LedgerTable columns={columns} rows={COINS} rowKey={(c) => c.coin} minWidth={640} />
    </section>
  );
}
