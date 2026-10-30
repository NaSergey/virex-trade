'use client';

import { SectionHead } from '@/shared/ui/SectionHead';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import type { LearningBlock, Mistake, QuarterRow, SystemBlock } from '../api/types';
import { FEATURE_LABELS, fmtDate, fmtInt, fmtPct, fmtR, ruleText, tone, valueText } from '../model/format';
import { LineChart } from './LineChart';

const rules = (list: QuarterRow['rules']) => (list.length ? list.map(ruleText).join('; ') : '—');

const quarterColumns: LedgerColumn<QuarterRow>[] = [
  { key: 'key', header: 'Квартал', render: (q) => q.key },
  { key: 'rules', header: 'Правила квартала', render: (q) => rules(q.rules) },
  { key: 'added', header: 'Добавлены', render: (q) => rules(q.added) },
  { key: 'removed', header: 'Сняты', render: (q) => rules(q.removed) },
  { key: 'train', header: 'Обучение', align: 'right', cellClassName: 'n', render: (q) => fmtInt(q.trainN) },
  { key: 'trades', header: 'Сделок', align: 'right', cellClassName: 'n', render: (q) => fmtInt(q.trades) },
  { key: 'excluded', header: 'Отсечено', align: 'right', cellClassName: 'n', render: (q) => fmtInt(q.excluded) },
];

const mistakeColumns: LedgerColumn<Mistake>[] = [
  { key: 'f', header: 'Признак', render: (m) => FEATURE_LABELS[m.feature] },
  { key: 'v', header: 'Корзина', render: (m) => valueText(m.feature, m.value) },
  { key: 'n', header: 'Сделок', align: 'right', cellClassName: 'n', render: (m) => fmtInt(m.n) },
  {
    key: 'mean',
    header: 'Средний R',
    align: 'right',
    cellClassName: 'n',
    render: (m) => <span className={tone(m.mean)}>{fmtR(m.mean)}</span>,
  },
  {
    key: 'ci',
    header: '95 % интервал',
    align: 'right',
    cellClassName: 'n',
    render: (m) => `${fmtR(m.lo)} … ${fmtR(m.hi)}`,
  },
];

interface SysRow {
  key: string;
  label: string;
  b: SystemBlock;
}

const sysColumns: LedgerColumn<SysRow>[] = [
  { key: 'label', header: 'Система', render: (r) => r.label },
  { key: 'n', header: 'Сделок', align: 'right', cellClassName: 'n', render: (r) => fmtInt(r.b.summary.n) },
  { key: 'wr', header: 'Винрейт', align: 'right', cellClassName: 'n', render: (r) => fmtPct(r.b.summary.winrate) },
  {
    key: 'exp',
    header: 'Мат ожидание',
    align: 'right',
    cellClassName: 'n',
    render: (r) => <span className={tone(r.b.summary.expectancy)}>{fmtR(r.b.summary.expectancy)}</span>,
  },
  { key: 'dd', header: 'Просадка 1 %', align: 'right', cellClassName: 'n', render: (r) => fmtPct(r.b.maxDd1) },
  {
    key: 'sum',
    header: 'Итог',
    align: 'right',
    cellClassName: 'n',
    render: (r) => <span className={tone(r.b.summary.sumR)}>{fmtR(r.b.summary.sumR)}</span>,
  },
];

function verdict(b: LearningBlock): string {
  const e = b.effect;
  if (e.mean == null) {
    return e.n === 0
      ? 'Правила ещё ни разу не отсекали сетапы вперёд — судить не о чем.'
      : `Правила отсекли вперёд всего ${e.n} сетапов — для вердикта мало.`;
  }
  const range = `${e.n} сетапов, средний R ${fmtR(e.mean)}, 95 % интервал ${fmtR(e.lo)} … ${fmtR(e.hi)}`;
  if (e.verdict === 'helped') {
    // У убыточной стратегии «помогает» отсечение почти любых сделок — без этой
    // оговорки вердикт читался бы как «обучение сделало систему прибыльной».
    const still =
      b.learned.summary.expectancy < 0
        ? ` Но и с правилами мат ожидание ${fmtR(b.learned.summary.expectancy)}: стратегия убыточна, правила лишь режут число сделок.`
        : '';
    return `Правила помогли: сетапы, которые они отсекли на следующих кварталах, уверенно теряли (${range}).${still}`;
  }
  if (e.verdict === 'hurt') {
    return `Правила вредят: отсечённые ими сетапы на следующих кварталах были прибыльными (${range}).`;
  }
  return `Эффект не доказан: отсечённые сетапы на следующих кварталах в пределах шума (${range}).`;
}

/** Обучение на ошибках: правила кварталов, проверка вперёд, типичные ошибки. */
export function LearningSection({ block }: { block: LearningBlock }) {
  return (
    <section id="learning" className="st-section">
      <SectionHead title="Обучение на ошибках" />
      <p className="muted">
        Раз в квартал с {fmtDate(block.fromMs)} система разбирает свои закрытые сделки по семи признакам и вводит
        правило «не брать такие сетапы», если сделки с признаком уверенно убыточны: не меньше 20, средний R ниже нуля
        вместе с 95 % интервалом. Правило применяется только к следующему кварталу — к сетапам, которых при обучении ещё
        не было; каждый квартал правила выводятся заново.
      </p>
      <p className="st-verdict">{verdict(block)}</p>
      <LedgerTable
        columns={sysColumns}
        rows={[
          { key: 'base', label: 'Без обучения', b: block.base },
          { key: 'learned', label: 'С обучением', b: block.learned },
        ]}
        rowKey={(r) => r.key}
      />
      <LineChart
        lines={[
          { label: 'Без обучения', values: block.base.equity.map((p) => p.r), tone: 'muted' },
          { label: 'С обучением', values: block.learned.equity.map((p) => p.r) },
        ]}
      />
      <h3 className="st-sub">Правила на {block.next.key}</h3>
      <p>
        {block.next.rules.length
          ? block.next.rules.map(ruleText).join('; ')
          : 'Правил нет — уверенно убыточных корзин не нашлось.'}
      </p>
      <h3 className="st-sub">Кварталы</h3>
      <LedgerTable columns={quarterColumns} rows={[...block.quarters].reverse()} rowKey={(q) => q.key} minWidth={900} />
      <h3 className="st-sub">Типичные ошибки за всю историю</h3>
      <p className="muted">Диагностика, а не правило: корзина становится правилом, только пройдя проверку вперёд.</p>
      <LedgerTable
        columns={mistakeColumns}
        rows={block.mistakes}
        rowKey={(m) => `${m.feature}:${m.value}`}
        empty="Убыточных корзин нет"
      />
    </section>
  );
}
