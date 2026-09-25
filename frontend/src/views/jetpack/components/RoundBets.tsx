'use client';

import { useTranslations } from 'next-intl';
import type { JetpackBetRow, JetpackView } from '@/entities/jetpack';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { formatX } from '../lib/flight';

type Row = JetpackBetRow & { key: string };

/**
 * Ставки раунда: кто сколько поставил и где забрал. Чужие цели автовывода не
 * видны (сервер их не шлёт) — видно только случившееся. Своя строка первой.
 * Ключ строки — место в списке: имя и сумма у двух ставок могут совпасть.
 */
export function RoundBets({ view }: { view: JetpackView }) {
  const t = useTranslations('jetpack');
  const crashed = view.phase === 'crashed';
  const rows: Row[] = view.bets.map((b, i) => ({ ...b, key: String(i) }));
  const columns: LedgerColumn<Row>[] = [
    {
      key: 'name',
      header: t('colPlayer'),
      render: (r) => <span className={r.mine ? 'jpg-mine' : undefined}>{r.name ?? t('anon')}</span>,
    },
    { key: 'amount', header: t('colBet'), align: 'right', cellClassName: 'n', render: (r) => r.amount.toLocaleString() },
    {
      key: 'x',
      header: t('colX'),
      align: 'right',
      cellClassName: 'n',
      render: (r) => (r.cashoutX100 !== null ? formatX(r.cashoutX100) : crashed ? '—' : '…'),
    },
    {
      key: 'win',
      header: t('colWin'),
      align: 'right',
      cellClassName: 'n',
      render: (r) =>
        r.payout !== null ? (
          <span className="jpg-won">+{r.payout.toLocaleString()}</span>
        ) : crashed ? (
          <span className="jpg-lost">−{r.amount.toLocaleString()}</span>
        ) : null,
    },
  ];
  return (
    <aside className="jpg-side">
      <div className="jpg-side-head">
        <span>{t('bets')}</span>
        <span className="n">
          {t('players', { n: view.players })} · {t('total', { n: view.totalBet.toLocaleString() })}
        </span>
      </div>
      {/* Мерка — под колонку, а не общие 760px таблицы: иначе в колонку шириной
          340px помещалось только «Игрок», а сумма, вывод и итог уезжали за край. */}
      <LedgerTable
        columns={columns}
        rows={rows}
        minWidth={280}
        rowKey={(r) => r.key}
        empty={<p className="jpg-wait">{t('noBets')}</p>}
      />
      <p className="jpg-rules">{t('rules')}</p>
    </aside>
  );
}
