'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';
import { Seg } from '@/shared/ui/Seg';
import { EMPTY_FILTERS, hasFilters, type NumFilterKey, type ViewFilter, type WalletFilters } from '../model/filter';

/**
 * Поля в порядке колонок таблицы. `bound` — «от» или «до» стоит прямо в поле,
 * `unit` — единица справа: подпись над полем остаётся названием колонки, а не
 * фразой «PnL 30д от, $».
 */
const FIELDS: { key: NumFilterKey; label: string; bound: 'from' | 'to'; unit: '$' | '%' }[] = [
  { key: 'balanceMin', label: 'fBalance', bound: 'from', unit: '$' },
  { key: 'pnlWeekMin', label: 'fPnlWeek', bound: 'from', unit: '$' },
  { key: 'pnlMonthMin', label: 'fPnlMonth', bound: 'from', unit: '$' },
  { key: 'pnl90Min', label: 'fPnl90', bound: 'from', unit: '$' },
  { key: 'pnlAllMin', label: 'fPnlAll', bound: 'from', unit: '$' },
  { key: 'roiMin', label: 'fRoi', bound: 'from', unit: '%' },
  { key: 'upShareMin', label: 'fUpShare', bound: 'from', unit: '%' },
  { key: 'bestWeekMax', label: 'fBestWeek', bound: 'to', unit: '%' },
  { key: 'drawdownMax', label: 'fDrawdown', bound: 'to', unit: '%' },
];

/**
 * Отбор строк таблицы кошельков: «от» по деньгам и качеству кривой, «до» по
 * просадке и доле лучшей недели, и «Все / Новые / Просмотренные». Состояние
 * живёт у страницы — фильтры меняют и счётчик, и листание.
 */
export function WalletFilters({
  value,
  onChange,
  shown,
  total,
}: {
  value: WalletFilters;
  onChange: (next: WalletFilters) => void;
  shown: number;
  total: number;
}) {
  const t = useTranslations('hlWallets');
  const views: { value: ViewFilter; label: string }[] = [
    { value: 'all', label: t('viewAll') },
    { value: 'new', label: t('viewNew') },
    { value: 'viewed', label: t('viewViewed') },
  ];
  return (
    <div className="hlf" role="search" aria-label={t('filtersAria')}>
      <div className="hlf-head">
        <Seg options={views} value={value.view} onChange={(view) => onChange({ ...value, view })} ariaLabel={t('viewAria')} />
        <span className="muted hlf-count">{t('shownOf', { shown, total })}</span>
        {hasFilters(value) ? (
          <Button variant="bare" tight onClick={() => onChange(EMPTY_FILTERS)}>
            {t('resetFilters')}
          </Button>
        ) : null}
      </div>
      <div className="hlf-grid">
        {FIELDS.map((f) => (
          <Field key={f.key} label={t(f.label)}>
            {(id) => (
              <Input
                id={id}
                full
                inputMode="decimal"
                prefix={t(f.bound === 'from' ? 'boundFrom' : 'boundTo')}
                suffix={f.unit}
                value={value[f.key]}
                onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
              />
            )}
          </Field>
        ))}
      </div>
    </div>
  );
}
