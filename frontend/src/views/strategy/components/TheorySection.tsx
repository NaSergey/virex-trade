'use client';

import { SectionHead } from '@/shared/ui/SectionHead';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import type { TheoryBlock } from '../api/types';
import { fmtNum, fmtPct, fmtR, fmtUsd, tone } from '../model/format';
import { VIDEO_2 } from '../model/rules';
import { LineChart, type Line } from './LineChart';

const TONES: Line['tone'][] = ['neg', 'ink', 'pos'];

const beColumns: LedgerColumn<{ r: number; winrate: number }>[] = [
  { key: 'r', header: 'Цель', render: (x) => `${x.r}R` },
  { key: 'wr', header: 'Нужный винрейт', align: 'right', cellClassName: 'n', render: (x) => fmtPct(x.winrate, 0) },
];

const asymColumns: LedgerColumn<{ loss: number; need: number }>[] = [
  { key: 'loss', header: 'Потеря', render: (x) => fmtPct(x.loss, 0) },
  {
    key: 'need',
    header: 'Нужно, чтобы вернуться',
    align: 'right',
    cellClassName: 'n',
    render: (x) => `+${fmtPct(x.need, 0)}`,
  },
];

/** «Трейдинг = математика» (КриптоБош) на сделках основного варианта. */
export function TheorySection({ t }: { t: TheoryBlock }) {
  const e = t.expectancy;
  const at = (n: number) => t.running.find((p) => p.n === n);
  const last = t.running[t.running.length - 1];
  const marks = [20, 100]
    .map((n) => ({ n, i: t.running.findIndex((p) => p.n === n) }))
    .filter((m) => m.i >= 0)
    .map((m) => ({ at: m.i, label: `${m.n} сделок` }));
  const ruinColumns: LedgerColumn<{ risk: number; p: number }>[] = [
    { key: 'risk', header: 'Риск на сделку', render: (x) => fmtPct(x.risk) },
    {
      key: 'p',
      header: `Шанс просадки 50 % за ${t.ruin.trades} сделок`,
      align: 'right',
      cellClassName: 'n',
      render: (x) => fmtPct(x.p),
    },
  ];

  return (
    <section id="theory" className="st-section">
      <SectionHead title="Теория: трейдинг = математика" />
      <p className="muted">
        Принципы видео{' '}
        <a href={VIDEO_2} target="_blank" rel="noreferrer">
          «Трейдинг = математика»
        </a>{' '}
        на сделках основного варианта. Блок выключается переключателем вверху страницы.
      </p>

      <h3 className="st-sub">1. Мат ожидание</h3>
      <p>
        Винрейт × средняя прибыль − доля убыточных × средний убыток = {fmtPct(e.winrate)} × {fmtNum(e.avgWin)}R −{' '}
        {fmtPct(1 - e.winrate)} × {fmtNum(e.avgLoss)}R = <span className={tone(e.net)}>{fmtR(e.net)}</span> на сделку, при
        риске $100 — {fmtUsd(e.net * 100)}. До комиссии было {fmtR(e.gross)}: мат ожидание на бумаге и на счёте — разные
        числа.
      </p>

      <h3 className="st-sub">2. Безубыточный винрейт</h3>
      <LedgerTable columns={beColumns} rows={t.breakeven.table} rowKey={(x) => String(x.r)} />
      <p>
        Средняя прибыль стратегии — {fmtNum(t.breakeven.avgWin)}R: ей нужен винрейт {fmtPct(t.breakeven.needed)}, а он{' '}
        <span className={t.breakeven.winrate > t.breakeven.needed ? 'pos' : 'neg'}>{fmtPct(t.breakeven.winrate)}</span>.
      </p>

      <h3 className="st-sub">3. Сколько сделок нужно, чтобы судить</h3>
      <LineChart lines={[{ label: 'Среднее R после N сделок', values: t.running.map((p) => p.mean) }]} marks={marks} />
      <p>
        После 20 сделок среднее — {fmtR(at(20)?.mean)}, после 100 — {fmtR(at(100)?.mean)}, за всю историю —{' '}
        {fmtR(last?.mean)}. Первые десятки сделок — шум.
      </p>

      <h3 className="st-sub">4. Вариативность</h3>
      <LineChart lines={t.variance.paths.map((p, i) => ({ label: p.label, values: p.points, tone: TONES[i] }))} />
      <p>
        {t.variance.sims} перестановок тех же сделок: одна система, разный опыт. Самая длинная серия минусов в истории —{' '}
        {t.variance.maxStreak} подряд; такая или длиннее встречается в {fmtPct(t.variance.pStreak)} перестановок. Рынок
        не помнит прошлых сделок: после серии минусов шанс следующей тот же.
      </p>

      <h3 className="st-sub">5. Риск и объём позиции</h3>
      <p>
        Объём = риск в долларах / размер стопа. Счёт {fmtUsd(t.sizing.account)}, риск {fmtPct(t.sizing.riskPct)} ={' '}
        {fmtUsd(t.sizing.riskUsd)}; медианный стоп стратегии — {fmtPct(t.sizing.stopPct, 2)} от входа, значит позиция{' '}
        {fmtUsd(t.sizing.position)}. 20 минусов подряд: при риске {fmtPct(t.sizing.streak20[0].risk, 0)} — минус{' '}
        {fmtPct(t.sizing.streak20[0].loss)} счёта, при {fmtPct(t.sizing.streak20[1].risk, 0)} — минус{' '}
        {fmtPct(t.sizing.streak20[1].loss)}.
      </p>

      <h3 className="st-sub">6. Риск разорения</h3>
      <LedgerTable columns={ruinColumns} rows={t.ruin.rows} rowKey={(x) => String(x.risk)} />
      <p className="muted">{t.ruin.sims} случайных последовательностей из сделок стратегии.</p>

      <h3 className="st-sub">7. Асимметрия убытков</h3>
      <LedgerTable columns={asymColumns} rows={t.asymmetry.table} rowKey={(x) => String(x.loss)} />
      <p>
        Макс. просадка стратегии при риске 1 % — {fmtPct(t.asymmetry.maxDd1)}; чтобы её отыграть, нужно +
        {fmtPct(t.asymmetry.need)}.
      </p>
    </section>
  );
}
