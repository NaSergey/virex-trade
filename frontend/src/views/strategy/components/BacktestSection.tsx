'use client';

import { useState } from 'react';
import { SectionHead } from '@/shared/ui/SectionHead';
import { MetricCell } from '@/shared/ui/MetricCell';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Pagination } from '@/shared/ui/Pagination';
import type { StrategyReport, TradeRow, VariantRow, YearRow } from '../api/types';
import { fmtDate, fmtDateTime, fmtInt, fmtNum, fmtPct, fmtPrice, fmtR, OUTCOME_LABELS, tone } from '../model/format';
import { LineChart } from './LineChart';
import { TradeChart } from './TradeChart';

const PAGE = 25;

const variantColumns: LedgerColumn<VariantRow>[] = [
  { key: 'label', header: 'Вариант', render: (v) => v.label },
  { key: 'setups', header: 'Сетапов', align: 'right', cellClassName: 'n', render: (v) => fmtInt(v.setups) },
  { key: 'n', header: 'Сделок', align: 'right', cellClassName: 'n', render: (v) => fmtInt(v.summary.n) },
  { key: 'wr', header: 'Винрейт', align: 'right', cellClassName: 'n', render: (v) => fmtPct(v.summary.winrate) },
  {
    key: 'be',
    header: 'Безубыточный',
    align: 'right',
    cellClassName: 'n',
    render: (v) => fmtPct(v.summary.breakeven),
  },
  {
    key: 'exp',
    header: 'Мат ожидание',
    align: 'right',
    cellClassName: 'n',
    render: (v) => <span className={tone(v.summary.expectancy)}>{fmtR(v.summary.expectancy)}</span>,
  },
  { key: 'gross', header: 'До комиссии', align: 'right', cellClassName: 'n', render: (v) => fmtR(v.grossExpectancy) },
  { key: 'pf', header: 'PF', align: 'right', cellClassName: 'n', render: (v) => fmtNum(v.summary.pf) },
  { key: 'dd', header: 'Просадка 1 %', align: 'right', cellClassName: 'n', render: (v) => fmtPct(v.maxDd1) },
  {
    key: 'sum',
    header: 'Итог',
    align: 'right',
    cellClassName: 'n',
    render: (v) => <span className={tone(v.summary.sumR)}>{fmtR(v.summary.sumR)}</span>,
  },
];

const yearColumns: LedgerColumn<YearRow>[] = [
  { key: 'year', header: 'Год', render: (y) => y.year },
  { key: 'n', header: 'Сделок', align: 'right', cellClassName: 'n', render: (y) => fmtInt(y.summary.n) },
  { key: 'wr', header: 'Винрейт', align: 'right', cellClassName: 'n', render: (y) => fmtPct(y.summary.winrate) },
  {
    key: 'exp',
    header: 'Мат ожидание',
    align: 'right',
    cellClassName: 'n',
    render: (y) => <span className={tone(y.summary.expectancy)}>{fmtR(y.summary.expectancy)}</span>,
  },
  {
    key: 'sum',
    header: 'Итог',
    align: 'right',
    cellClassName: 'n',
    render: (y) => <span className={tone(y.summary.sumR)}>{fmtR(y.summary.sumR)}</span>,
  },
];

const tradeColumns: LedgerColumn<TradeRow>[] = [
  { key: 'date', header: 'Вход (UTC)', render: (t) => fmtDateTime(t.fillMs) },
  { key: 'dir', header: 'Сторона', render: (t) => (t.dir === 1 ? 'Лонг' : 'Шорт') },
  { key: 'entry', header: 'Вход', align: 'right', cellClassName: 'n', render: (t) => fmtPrice(t.fill) },
  { key: 'stop', header: 'Стоп', align: 'right', cellClassName: 'n', render: (t) => fmtPrice(t.stop) },
  { key: 'target', header: 'Цель', align: 'right', cellClassName: 'n', render: (t) => fmtPrice(t.target) },
  { key: 'plan', header: 'План', align: 'right', cellClassName: 'n', render: (t) => fmtR(t.plannedR) },
  { key: 'outcome', header: 'Выход', render: (t) => OUTCOME_LABELS[t.outcome] },
  {
    key: 'r',
    header: 'R',
    align: 'right',
    cellClassName: 'n',
    render: (t) => <span className={tone(t.rNet)}>{fmtR(t.rNet)}</span>,
  },
];

/** Сводка основного варианта, варианты рядом, кривая, годы и сделки с графиком. */
export function BacktestSection({ report }: { report: StrategyReport }) {
  const { variant, equity, byYear, trades } = report.main;
  const s = variant.summary;
  const [page, setPage] = useState(1);
  const newestFirst = [...trades].reverse();

  return (
    <section id="backtest" className="st-section">
      <SectionHead title="Бектест" />
      <p className="muted">
        BTCUSDT, {fmtDate(report.dataFrom)} — {fmtDate(report.dataTo)}. Основной вариант: сетап на 15m, контекст 4H,
        свип + имбаланс + слом, вход от верха ордерблока, цель — ликвидность сверху. Одна позиция за раз, R — после
        комиссии Bybit.
      </p>
      <div className="st-metrics">
        <MetricCell
          label="Сделок"
          value={fmtInt(s.n)}
          sub={`сетапов ${fmtInt(variant.setups)}, исполнено ${fmtInt(variant.filled)}`}
        />
        <MetricCell label="Винрейт" value={fmtPct(s.winrate)} sub={`безубыточный ${fmtPct(s.breakeven)}`} />
        <MetricCell
          label="Мат ожидание"
          value={fmtR(s.expectancy)}
          tone={tone(s.expectancy)}
          sub={`до комиссии ${fmtR(variant.grossExpectancy)}`}
        />
        <MetricCell label="Профит-фактор" value={fmtNum(s.pf)} />
        <MetricCell label="Просадка при риске 1 %" value={fmtPct(variant.maxDd1)} />
        <MetricCell label="Итог" value={fmtR(s.sumR)} tone={tone(s.sumR)} />
      </div>

      <h3 className="st-sub">Кривая счёта — накопленный R по номеру сделки</h3>
      <LineChart lines={[{ label: 'Основной', values: equity.map((p) => p.r) }]} />

      <h3 className="st-sub">Варианты</h3>
      <p className="muted">
        Каждый отличается от основного одним правилом. «Сетапов» — сколько нашлось, сводка — по сделкам одной позиции за
        раз.
      </p>
      <LedgerTable columns={variantColumns} rows={report.variants} rowKey={(v) => v.id} minWidth={980} />

      <h3 className="st-sub">По годам</h3>
      <LedgerTable columns={yearColumns} rows={byYear} rowKey={(y) => String(y.year)} />

      <h3 className="st-sub">Сделки — строка открывает график</h3>
      <LedgerTable
        columns={tradeColumns}
        rows={newestFirst.slice((page - 1) * PAGE, page * PAGE)}
        rowKey={(t) => t.id}
        renderExpanded={(t) => <TradeChart trade={t} />}
        minWidth={860}
        empty="Сделок нет"
      />
      <Pagination
        page={page}
        pageSize={PAGE}
        total={newestFirst.length}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />
    </section>
  );
}
