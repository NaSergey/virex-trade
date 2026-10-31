'use client';

import { SectionHead } from '@/shared/ui/SectionHead';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import type { StrategyReport, Summary, VariantRow } from '../api/types';
import { fmtInt, fmtPct, fmtR, tone } from '../model/format';
import {
  COINS,
  MIN_TEST_N,
  PLACEBO,
  POOLED_CI,
  SEARCH,
  TRIED,
  type CoinRow,
  type SearchRow,
} from '../model/research';

interface Row {
  key: string;
  row: SearchRow;
  v: VariantRow;
}

const passed = (v: VariantRow) => v.test.expectancy > 0 && v.test.n >= MIN_TEST_N;
const result = (s: Summary) => <span className={tone(s.expectancy)}>{fmtR(s.expectancy)}</span>;

const columns: LedgerColumn<Row>[] = [
  { key: 'dir', header: 'Направление', render: (r) => r.row.direction },
  { key: 'label', header: 'Вариант', render: (r) => r.v.label },
  { key: 'dev', header: '2018–2022', align: 'right', cellClassName: 'n', render: (r) => result(r.v.dev) },
  { key: 'devN', header: 'Сделок', align: 'right', cellClassName: 'n', render: (r) => fmtInt(r.v.dev.n) },
  {
    key: 'test',
    header: '2023+',
    align: 'right',
    cellClassName: 'n',
    render: (r) => (r.row.finalist ? result(r.v.test) : '—'),
  },
  {
    key: 'testN',
    header: 'Сделок',
    align: 'right',
    cellClassName: 'n',
    render: (r) => (r.row.finalist ? fmtInt(r.v.test.n) : '—'),
  },
  {
    key: 'pass',
    header: 'Зачёт',
    render: (r) => (r.row.finalist ? (passed(r.v) ? 'да' : 'нет') : 'не в финале'),
  },
];

const coinColumns: LedgerColumn<CoinRow>[] = [
  { key: 'coin', header: 'Монета', render: (c) => c.coin },
  { key: 'n', header: 'Сделок', align: 'right', cellClassName: 'n', render: (c) => fmtInt(c.n) },
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
];

/** Как искали улучшения: подбор до 2023 года, проверка после, другие монеты и случайный вход. */
export function ResearchSection({ report }: { report: StrategyReport }) {
  const rows: Row[] = SEARCH.flatMap((row) => {
    const v = report.variants.find((x) => x.id === row.id);
    return v ? [{ key: row.id, row, v }] : [];
  });
  const finalists = rows.filter((r) => r.row.finalist);
  const won = finalists.filter((r) => passed(r.v));
  const main = report.main.variant;
  return (
    <section id="research" className="st-section">
      <SectionHead title="Поиск улучшений" />
      <p className="muted">
        Перебрано {TRIED} варианта по пяти направлениям. Подбор — только по сделкам 2018–2022; сделки с 2023 года
        открыты лишь для пяти финалистов. Условие зачёта задано заранее: на 2023+ мат ожидание после комиссии выше нуля и
        не меньше {MIN_TEST_N} сделок. Финалисты — от 20 сделок на подборе; 4H взят сверх этого условия, за самый высокий
        результат. Всего вариантов в таблице меньше {TRIED}: здесь показательные для каждого направления.
      </p>
      <p className="st-verdict">
        {won.length
          ? `Зачёт прошли: ${won.map((r) => r.v.label).join(', ')}.`
          : `Зачёт не прошёл ни один из ${finalists.length} финалистов.`}{' '}
        Основным стал 4H: на новых годах {fmtR(main.test.expectancy)} на {fmtInt(main.test.n)} сделках, винрейт{' '}
        {fmtPct(main.summary.winrate)} при безубыточном {fmtPct(main.summary.breakeven)}. Это кандидат, а не доказанное
        преимущество: сделок мало, и на других монетах то же правило не повторилось.
      </p>
      <LedgerTable columns={columns} rows={rows} rowKey={(r) => r.key} minWidth={760} />
      <h3 className="st-sub">То же правило 4H на других монетах</h3>
      <p className="muted">
        Снимок от 31.10.2026, правило без единой правки. По всем четырём монетам 95 % интервал мат ожидания —{' '}
        {fmtR(POOLED_CI.lo)} … {fmtR(POOLED_CI.hi)}: ноль внутри. Случайный вход на BTC с теми же сторонами и стопами:
        медиана {fmtR(PLACEBO.median)}, лучший из {PLACEBO.runs} прогонов {fmtR(PLACEBO.max)}, настоящее правило обогнали{' '}
        {PLACEBO.above} из {PLACEBO.runs}. Но 4H — лучший из {TRIED} вариантов, и такой отрыв при переборе ждать можно.
      </p>
      <LedgerTable columns={coinColumns} rows={COINS} rowKey={(c) => c.coin} />
    </section>
  );
}
