'use client';

import { useMemo, useState } from 'react';
import { Tag, TAG_TYPE_LABELS, useDeleteTag, type TagBucket } from '@/entities/tag';
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
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'trades', dir: -1 });
  const deleteTag = useDeleteTag();

  // Сделка с двумя тегами попадает в обе строки целиком, поэтому столбец
  // сделок в сумме больше, чем сделок на самом деле. Разница и есть признак
  // пересечения — считаем её, а не показываем сноску всем подряд: у того, кто
  // ставит по одному тегу, суммы сходятся и предупреждать не о чем.
  const overlapping = useMemo(
    () => tags.filter((t) => t.id != null).reduce((sum, t) => sum + t.trades, 0) > taggedTrades,
    [tags, taggedTrades],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = tags.filter((t) => t.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => (a[sort.key] - b[sort.key]) * sort.dir);
  }, [tags, search, sort]);

  const columns: LedgerColumn<TagBucket>[] = [
    {
      key: 'name',
      header: 'Тег',
      render: (t) =>
        // Строка «без тегов» — не тег: её нельзя ни переименовать, ни удалить.
        t.id == null ? (
          <span className="muted">{t.name}</span>
        ) : (
          <Button
            variant="none"
            title="Переименовать или сменить категорию"
            style={{ appearance: 'none', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
            onClick={() => onEditTag(t.id!)}
          >
            <Tag name={t.name} color={t.color} />
          </Button>
        ),
    },
    {
      key: 'type',
      header: 'Категория',
      render: (t) => <span className="muted">{t.type ? TAG_TYPE_LABELS[t.type] : '—'}</span>,
    },
    { key: 'trades', header: 'Сделок', align: 'right', cellClassName: 'n', sortKey: 'trades', render: (t) => t.trades },
    {
      key: 'winRate',
      header: 'Винрейт',
      align: 'right',
      cellClassName: 'n',
      sortKey: 'winRate',
      render: (t) => `${t.winRate.toFixed(1)} %`,
    },
    {
      key: 'profitFactor',
      header: 'Profit factor',
      align: 'right',
      cellClassName: 'n',
      sortKey: 'profitFactor',
      render: (t) => (
        <span className={t.profitFactor >= 1 ? 'pos' : 'neg'}>
          {formatProfitFactor(t.profitFactor, t.wins, t.losses)}
        </span>
      ),
    },
    {
      key: 'avgWin',
      header: 'Ср. прибыль',
      align: 'right',
      cellClassName: 'n pos',
      sortKey: 'avgWin',
      render: (t) => formatMoney(t.avgWin),
    },
    {
      key: 'avgLoss',
      header: 'Ср. убыток',
      align: 'right',
      cellClassName: 'n neg',
      sortKey: 'avgLoss',
      render: (t) => formatMoney(t.avgLoss),
    },
    {
      key: 'totalPnl',
      header: 'Итог',
      align: 'right',
      cellClassName: 'n',
      sortKey: 'totalPnl',
      render: (t) => <Money value={t.totalPnl} large />,
    },
    {
      key: 'spark',
      header: 'Динамика',
      width: 84,
      render: (t) => (
        <Sparkline
          values={t.equity.map((p) => p.value)}
          color={t.totalPnl >= 0 ? 'var(--color-up)' : 'var(--color-down)'}
        />
      ),
    },
    {
      key: 'del',
      width: 20,
      align: 'right',
      render: (t) =>
        t.id == null ? null : (
          <Button
            variant="bare"
            title="Удалить тег"
            onClick={() =>
              askConfirm({
                title: `Удалить тег «${t.name}»?`,
                subtitle: 'Тег снимется со всех сделок, где он стоит.',
                consequences: [
                  `тег исчезнет с ${t.trades} сделок`,
                  'комбинации будут пересчитаны',
                  'отменить нельзя',
                ],
                word: 'УДАЛИТЬ',
                onConfirm: () => t.id && deleteTag.mutate(t.id),
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
          placeholder="поиск по названию…"
          aria-label="Поиск по названию тега"
          style={{ width: 190 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <NewTagRow />
      </div>

      <LedgerTable
        columns={columns}
        rows={rows}
        rowKey={(t) => t.id ?? t.name}
        minWidth={900}
        sort={sort}
        onSort={(key) =>
          setSort((s) =>
            s.key === key ? { key: s.key, dir: (s.dir * -1) as 1 | -1 } : { key: key as SortKey, dir: -1 },
          )
        }
        empty={search ? 'Ни один тег не подошёл под поиск.' : 'За этот период сделок с тегами нет.'}
      />

      {/* Без этой оговорки первый же человек, сложивший столбец P&L, решит, что
          у него сломана математика. Сделка не делится между своими тегами —
          она целиком принадлежит каждому, иначе «пробой» приносил бы треть
          того, что принёс на самом деле, и число не значило бы ничего. */}
      {overlapping && (
        <p className="foot">
          У сделки может быть несколько тегов, и в каждую строку она попадает <b>целиком</b>.
          Поэтому строки пересекаются, а столбцы «Сделки» и «P&L» не суммируются в общий итог по
          периоду — каждая строка отвечает на вопрос «как торгуется с этим тегом», а не «какая
          доля результата приходится на него».
        </p>
      )}
    </div>
  );
}
