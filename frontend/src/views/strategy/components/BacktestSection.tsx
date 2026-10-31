'use client';

import { useState } from 'react';
import { SectionHead } from '@/shared/ui/SectionHead';
import { MetricCell } from '@/shared/ui/MetricCell';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Pagination } from '@/shared/ui/Pagination';
import type { SideRow, StrategyReport, TradeRow, YearRow } from '../api/types';
import {
  fmtDate,
  fmtDateTime,
  fmtInt,
  fmtNum,
  fmtPct,
  fmtPrice,
  fmtR,
  fmtUsd,
  OUTCOME_LABELS,
  tone,
} from '../model/format';
import { LineChart } from './LineChart';
import { TradeChart } from './TradeChart';

const PAGE = 25;

interface SideLine {
  key: string;
  label: string;
  s: SideRow;
}

const sideColumns: LedgerColumn<SideLine>[] = [
  { key: 'label', header: 'Сделки', render: (r) => r.label },
  { key: 'n', header: 'Сделок', align: 'right', cellClassName: 'n', render: (r) => fmtInt(r.s.summary.n) },
  {
    key: 'wr',
    header: 'Винрейт',
    align: 'right',
    cellClassName: 'n',
    render: (r) => (r.s.summary.n ? fmtPct(r.s.summary.winrate) : '—'),
  },
  {
    key: 'be',
    header: 'Безубыточный',
    align: 'right',
    cellClassName: 'n',
    render: (r) => (r.s.summary.n ? fmtPct(r.s.summary.breakeven) : '—'),
  },
  {
    key: 'exp',
    header: 'Мат ожидание',
    align: 'right',
    cellClassName: 'n',
    render: (r) => <span className={tone(r.s.summary.expectancy)}>{fmtR(r.s.summary.expectancy)}</span>,
  },
  { key: 'gross', header: 'До комиссии', align: 'right', cellClassName: 'n', render: (r) => fmtR(r.s.grossExpectancy) },
  { key: 'pf', header: 'PF', align: 'right', cellClassName: 'n', render: (r) => fmtNum(r.s.summary.pf) },
  { key: 'dd', header: 'Просадка 1 %', align: 'right', cellClassName: 'n', render: (r) => fmtPct(r.s.maxDd1) },
  {
    key: 'sum',
    header: 'Итог',
    align: 'right',
    cellClassName: 'n',
    render: (r) => <span className={tone(r.s.summary.sumR)}>{fmtR(r.s.summary.sumR)}</span>,
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
  { key: 'avg', header: 'Средний вход', align: 'right', cellClassName: 'n', render: (t) => fmtPrice(t.avgEntry) },
  { key: 'filled', header: 'Исполнено', align: 'right', cellClassName: 'n', render: (t) => `${t.filled}/${t.entries.length}` },
  { key: 'stop', header: 'Стоп', align: 'right', cellClassName: 'n', render: (t) => fmtPrice(t.stop) },
  { key: 'target', header: 'Цель', align: 'right', cellClassName: 'n', render: (t) => fmtPrice(t.target) },
  { key: 'plan', header: 'План', align: 'right', cellClassName: 'n', render: (t) => fmtR(t.plannedR) },
  { key: 'takes', header: 'Тейков', align: 'right', cellClassName: 'n', render: (t) => `${t.takesHit}/${t.takes.length}` },
  { key: 'outcome', header: 'Выход', render: (t) => OUTCOME_LABELS[t.outcome] },
  {
    key: 'r',
    header: 'R',
    align: 'right',
    cellClassName: 'n',
    render: (t) => <span className={tone(t.rNet)}>{fmtR(t.rNet)}</span>,
  },
  {
    key: 'odds',
    header: 'Шанс / нужно',
    align: 'right',
    cellClassName: 'n',
    render: (t) => (t.odds ? `${fmtPct(t.odds.p, 0)} / ${fmtPct(t.odds.needed, 0)}` : '—'),
  },
];

/** Итоги стратегии за последние 2 года: лонги и шорты, деньги, кривая, годы и сделки с графиком. */
export function BacktestSection({ report, theory }: { report: StrategyReport; theory: boolean }) {
  const { stats, sides, equity, byYear, trades } = report.main;
  const s = stats.summary;
  const [page, setPage] = useState(1);
  const newestFirst = [...trades].reverse();
  const money = theory ? report.main.money.theory : report.main.money.plain;

  return (
    <section id="backtest" className="st-section">
      <SectionHead title="Бектест за последние 2 года" />
      <p className="muted">
        BTCUSDT, {fmtDate(report.dataFrom)} — {fmtDate(report.dataTo)}. Контекст — 4H, сетап — 1H (свип, имбаланс, слом,
        ордерблок), вход — по имбалансу 15m внутри блока: сетка из 4 лимитов, план 3–5R, 3 тейка со стопом за ними, лонгов
        70 % и шортов 30 %. Одна позиция за раз, R — от риска всей сетки, после комиссии Bybit.
      </p>
      <div className="st-metrics">
        <MetricCell
          label="Сделок"
          value={fmtInt(s.n)}
          sub={`сетапов ${fmtInt(stats.setups)}, исполнено до отбора ${fmtInt(stats.filled)}`}
        />
        <MetricCell label="Винрейт" value={fmtPct(s.winrate)} sub={`безубыточный ${fmtPct(s.breakeven)}`} />
        <MetricCell
          label="Мат ожидание"
          value={fmtR(s.expectancy)}
          tone={tone(s.expectancy)}
          sub={`до комиссии ${fmtR(stats.grossExpectancy)}`}
        />
        <MetricCell label="Профит-фактор" value={fmtNum(s.pf)} />
        <MetricCell label="Просадка при риске 1 %" value={fmtPct(stats.maxDd1)} />
        <MetricCell label="Итог" value={fmtR(s.sumR)} tone={tone(s.sumR)} />
      </div>

      <h3 className="st-sub">Лонги и шорты</h3>
      <LedgerTable
        columns={sideColumns}
        rows={[
          { key: 'all', label: 'Все', s: sides.all },
          { key: 'long', label: 'Лонги', s: sides.long },
          { key: 'short', label: 'Шорты', s: sides.short },
        ]}
        rowKey={(r) => r.key}
        minWidth={820}
      />

      <h3 className="st-sub">
        Счёт {fmtUsd(money.start)} — {theory ? 'с управлением риском: 1 % текущего счёта' : 'без управления риском: одинаковый объём'}
      </h3>
      <div className="st-metrics">
        <MetricCell label="Итог" value={fmtUsd(money.final)} tone={tone(money.final - money.start)} />
        <MetricCell label="Макс. просадка" value={fmtPct(money.maxDd)} />
        <MetricCell label="Худшая сделка" value={fmtPct(money.worstTrade)} tone={tone(money.worstTrade)} />
      </div>
      <LineChart lines={[{ label: 'Счёт, $', values: money.equity }]} />
      {!theory && (
        <p className="muted">
          Объём каждой сделки — {fmtUsd(report.main.money.plainNotional)}: на медианном стопе это тот же 1 % стартового
          счёта, но без поправки на стоп сделки и на текущий счёт.
        </p>
      )}

      <h3 className="st-sub">Кривая счёта — накопленный R по номеру сделки</h3>
      <LineChart lines={[{ label: 'Основной', values: equity.map((p) => p.r) }]} />


      <h3 className="st-sub">По годам</h3>
      <LedgerTable columns={yearColumns} rows={byYear} rowKey={(y) => String(y.year)} />

      <h3 className="st-sub">Сделки — строка открывает график</h3>
      <LedgerTable
        columns={tradeColumns}
        rows={newestFirst.slice((page - 1) * PAGE, page * PAGE)}
        rowKey={(t) => t.id}
        renderExpanded={(t) => <TradeChart trade={t} />}
        minWidth={1100}
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
