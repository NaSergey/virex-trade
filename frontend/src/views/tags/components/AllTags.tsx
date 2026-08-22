'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tag, useDeleteTag, useTagTypeLabels, type TagBucket } from '@/entities/tag';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import type { ConfirmRequest } from '@/shared/ui/ConfirmDialog';
import { formatMoney, formatProfitFactor } from '@/shared/lib/utils/format';
import { Sparkline } from './Sparkline';
import { NewTagRow } from './NewTagRow';

/** Колонки, по которым таблицу можно отсортировать, — только числовые. */
type SortKey = 'trades' | 'winRate' | 'profitFactor' | 'avgWin' | 'avgLoss' | 'totalPnl';

/**
 * Раздел «Все теги»: поиск, строка создания и сама таблица.
 *
 * Поиск и сортировка живут здесь, а не на странице: они не значат ничего за
 * пределами этой таблицы и ни на что другое на странице не влияют.
 * Наружу вынесены только два действия, у которых есть последствия за таблицей, —
 * правка тега (открывает диалог страницы) и удаление (подтверждается общим
 * диалогом продукта).
 */
export function AllTags({
  tags,
  taggedTrades,
  onEditTag,
  askConfirm,
}: {
  tags: TagBucket[];
  /** Сколько всего сделок несут хотя бы один тег — база для проверки пересечений. */
  taggedTrades: number;
  onEditTag: (tagId: string) => void;
  askConfirm: (request: ConfirmRequest) => void;
}) {
  const t = useTranslations('tags');
  const typeLabels = useTagTypeLabels();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'trades', dir: -1 });
  const deleteTag = useDeleteTag();

  // Сделка с двумя тегами попадает в обе строки целиком, поэтому столбец
  // сделок в сумме больше, чем сделок на самом деле. Разница и есть признак
  // пересечения — считаем её, а не показываем сноску всем подряд: у того, кто
  // ставит по одному тегу, суммы сходятся и предупреждать не о чем.
  const overlapping = useMemo(
    () => tags.filter((tag) => tag.id != null).reduce((sum, tag) => sum + tag.trades, 0) > taggedTrades,
    [tags, taggedTrades],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = tags.filter((tag) => tag.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => (a[sort.key] - b[sort.key]) * sort.dir);
  }, [tags, search, sort]);

  const columns: LedgerColumn<TagBucket>[] = [
    {
      key: 'name',
      header: t('colName'),
      render: (row) =>
        // Строка «без тегов» — не тег: её нельзя ни переименовать, ни удалить.
        row.id == null ? (
          <span className="muted">{row.name}</span>
        ) : (
          <Button
            variant="none"
            title={t('renameTitle')}
            style={{ appearance: 'none', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
            onClick={() => onEditTag(row.id!)}
          >
            <Tag name={row.name} color={row.color} />
          </Button>
        ),
    },
    {
      key: 'type',
      header: t('colCategory'),
      render: (row) => <span className="muted">{row.type ? typeLabels[row.type] : '—'}</span>,
    },
    { key: 'trades', header: t('colTrades'), align: 'right', cellClassName: 'n', sortKey: 'trades', render: (row) => row.trades },
    {
      key: 'winRate',
      header: t('colWinrate'),
      align: 'right',
      cellClassName: 'n',
      sortKey: 'winRate',
      render: (row) => `${row.winRate.toFixed(1)} %`,
    },
    {
      key: 'profitFactor',
      header: 'Profit factor',
      align: 'right',
      cellClassName: 'n',
      sortKey: 'profitFactor',
      render: (row) => (
        <span className={row.profitFactor >= 1 ? 'pos' : 'neg'}>
          {formatProfitFactor(row.profitFactor, row.wins, row.losses)}
        </span>
      ),
    },
    {
      key: 'avgWin',
      header: t('colAvgWin'),
      align: 'right',
      cellClassName: 'n pos',
      sortKey: 'avgWin',
      render: (row) => formatMoney(row.avgWin),
    },
    {
      key: 'avgLoss',
      header: t('colAvgLoss'),
      align: 'right',
      cellClassName: 'n neg',
      sortKey: 'avgLoss',
      render: (row) => formatMoney(row.avgLoss),
    },
    {
      key: 'totalPnl',
      header: t('colTotal'),
      align: 'right',
      cellClassName: 'n',
      sortKey: 'totalPnl',
      render: (row) => <Money value={row.totalPnl} large />,
    },
    {
      key: 'spark',
      header: t('colDynamics'),
      width: 84,
      render: (row) => (
        <Sparkline
          values={row.equity.map((p) => p.value)}
          color={row.totalPnl >= 0 ? 'var(--color-up)' : 'var(--color-down)'}
        />
      ),
    },
    {
      key: 'del',
      width: 20,
      align: 'right',
      render: (row) =>
        row.id == null ? null : (
          <Button
            variant="bare"
            title={t('deleteTagTitle')}
            onClick={() =>
              askConfirm({
                title: t('deleteTagConfirmTitle', { name: row.name }),
                subtitle: t('deleteTagSubtitle'),
                consequences: [
                  t('deleteTagConsequence1', { n: row.trades }),
                  t('deleteTagConsequence2'),
                  t('deleteConsequenceIrreversible'),
                ],
                word: t('deleteWord'),
                onConfirm: () => row.id && deleteTag.mutate(row.id),
              })
            }
          >
            ✕
          </Button>
        ),
    },
  ];

  return (
    <div style={{ marginTop: 'var(--s5)' }}>

      {/* Отбор и добавление — одна строка на двух краях: слева сужают то, что
          уже есть, справа заводят новое. Оба действия относятся ко всему
          списку целиком, поэтому и стоят над ним вместе, а не порознь. */}
      <div className="newrow">
        <Input
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchAriaLabel')}
          style={{ width: 190 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <NewTagRow />
      </div>

      <LedgerTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id ?? row.name}
        minWidth={900}
        sort={sort}
        onSort={(key) =>
          setSort((s) =>
            s.key === key ? { key: s.key, dir: (s.dir * -1) as 1 | -1 } : { key: key as SortKey, dir: -1 },
          )
        }
        empty={search ? t('emptySearch') : t('emptyNoTags')}
      />

      {/* Без этой оговорки первый же человек, сложивший столбец P&L, решит, что
          у него сломана математика. Сделка не делится между своими тегами —
          она целиком принадлежит каждому, иначе «пробой» приносил бы треть
          того, что принёс на самом деле, и число не значило бы ничего. */}
      {overlapping && <p className="foot">{t('overlapNote')}</p>}
    </div>
  );
}
