'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';
import { Seg } from '@/shared/ui/Seg';
import { EMPTY_FILTERS, hasFilters, type NumFilterKey, type ViewFilter, type WalletFilters } from '../model/filter';

/** Поля в порядке колонок таблицы; `%` — значение вводится процентами, как показано в таблице. */
const FIELDS: { key: NumFilterKey; label: string; unit?: '%' | '$' }[] = [
  { key: 'balanceMin', label: 'fBalanceMin', unit: '$' },
  { key: 'pnlWeekMin', label: 'fPnlWeekMin', unit: '$' },
  { key: 'pnlMonthMin', label: 'fPnlMonthMin', unit: '$' },
  { key: 'pnl90Min', label: 'fPnl90Min', unit: '$' },
  { key: 'pnlAllMin', label: 'fPnlAllMin', unit: '$' },
  { key: 'roiMin', label: 'fRoiMin', unit: '%' },
  { key: 'upShareMin', label: 'fUpShareMin', unit: '%' },
  { key: 'bestWeekMax', label: 'fBestWeekMax', unit: '%' },
  { key: 'drawdownMax', label: 'fDrawdownMax', unit: '%' },
];

/**
 * Отбор строк таблицы кошельков: «от» по деньгам и качеству кривой, «до» по
 * просадке и доле лучшей недели, и «новые / просмотренные». Состояние живёт у
 * страницы — фильтры меняют и счётчик, и листание.
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
    <div className="newrow" role="search" aria-label={t('filtersAria')}>
      <Seg options={views} value={value.view} onChange={(view) => onChange({ ...value, view })} ariaLabel={t('viewAria')} />
      {FIELDS.map((f) => (
        <Field key={f.key} label={t(f.label)} style={{ width: 120 }}>
          {(id) => (
            <Input
              id={id}
              full
              inputMode="decimal"
              placeholder="—"
              suffix={f.unit}
              value={value[f.key]}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
            />
          )}
        </Field>
      ))}
      <div className="newrow-r">
        <span className="muted">{t('shownOf', { shown, total })}</span>
        {hasFilters(value) ? (
          <Button variant="bare" tight onClick={() => onChange(EMPTY_FILTERS)}>
            {t('resetFilters')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
