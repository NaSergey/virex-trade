'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useTags,
  useCreateTag,
  useDeleteTag,
  useTagStats,
  useTagComboStats,
  useCreateSavedCombo,
  useUpdateSavedCombo,
  useDeleteSavedCombo,
  useDismissCombo,
  TAG_TYPES,
  TAG_TYPE_LABELS,
  type TagBucket,
  type TagComboBucket,
  type TagItem,
  type TagType,
} from '@/shared/api/tags/hooks';
import { Wrap } from '@/shared/ui/Wrap';
import { Tag, TagCombo } from '@/shared/ui/Tag';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { ConfirmDialog, type ConfirmRequest } from '@/shared/ui/ConfirmDialog';
import { MIN_N } from '@/shared/lib/utils/confidence';
import { formatMoney, formatProfitFactor, moneyClass } from '@/shared/lib/utils/format';
import { usePeriodFilter } from './usePeriodFilter';
import { PeriodRail } from './PeriodRail';
import { ConfidenceTrack } from './ConfidenceTrack';
import { Sparkline } from './Sparkline';
import { EditTagDialog } from './EditTagDialog';
import { CreateComboDialog } from './CreateComboDialog';

type SortKey = 'trades' | 'winRate' | 'profitFactor' | 'avgWin' | 'avgLoss' | 'totalPnl';

/** Строка таблицы комбинаций: сам срез плюс то, что с ним можно сделать. */
interface ComboRow {
  key: string;
  combo: TagComboBucket;
  pinned: boolean;
  onTogglePin: () => void;
  onRefresh: () => void;
  /** Только у сохранённой комбинации — удаление насовсем. */
  onDelete?: () => void;
  /** Только у предложенной — убрать из предложений. */
  onDismiss?: () => void;
}

/** Ключ набора тегов, не зависящий от порядка — им сверяются авто- и сохранённые комбинации. */
const comboKey = (tagIds: string[]) => [...tagIds].sort().join('|');

/**
 * Теги: сначала комбинации (что с чем встречалось вместе и чем это кончалось),
 * потом сами теги по одному.
 *
 * Комбинации — таблица, а не сетка карточек: карточки можно только разглядывать
 * по одной, а вопрос к ним всегда сравнительный — «какое сочетание держится
 * лучше». В таблице сравнение делается взглядом по колонке.
 */
export function TagsPage() {
  const { days, customDate, customActive, effectiveDays, setDays, setCustomDate } = usePeriodFilter();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'trades', dir: -1 });
  const [editing, setEditing] = useState<TagItem | null>(null);
  const [comboDialog, setComboDialog] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const qc = useQueryClient();
  const { data: tagsData } = useTags();
  const { data: statsData } = useTagStats(effectiveDays);
  const { data: comboData } = useTagComboStats(effectiveDays);
  const deleteTag = useDeleteTag();
  const pin = useCreateSavedCombo();
  const updateCombo = useUpdateSavedCombo();
  const deleteCombo = useDeleteSavedCombo();
  const dismiss = useDismissCombo();

  const tagRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (statsData?.tags ?? []).filter((t) => t.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => (a[sort.key] - b[sort.key]) * sort.dir);
  }, [statsData, search, sort]);

  const refreshCombos = () => void qc.invalidateQueries({ queryKey: ['tagComboStats'] });

  const savedKeys = new Set((comboData?.saved ?? []).map((s) => comboKey(s.tagIds)));
  // Закреплённые — первыми: открепление не убирает карточку из списка, поэтому
  // без этой сортировки нажатие «открепить» никак не отражалось бы на порядке.
  const comboRows: ComboRow[] = [
    ...[...(comboData?.saved ?? [])]
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.trades - a.trades || b.winRate - a.winRate)
      .map((c) => ({
        key: c.id,
        combo: c,
        pinned: c.pinned,
        onTogglePin: () => updateCombo.mutate({ id: c.id, pinned: !c.pinned }),
        onRefresh: refreshCombos,
        // Оптимистично добавленная карточка ещё не существует на сервере —
        // удалять нечего.
        onDelete: c.id.startsWith('pending-')
          ? undefined
          : () =>
              setConfirm({
                title: 'Удалить комбинацию?',
                subtitle: `«${c.tagNames.join(' + ')}» исчезнет из списка.`,
                consequences: [
                  'сами теги и сделки не пострадают',
                  'комбинация перестанет предлагаться',
                  'её можно будет собрать заново вручную',
                ],
                word: 'УДАЛИТЬ',
                onConfirm: () => deleteCombo.mutate(c.id),
              }),
      })),
    ...(comboData?.combos ?? [])
      .filter((c) => !savedKeys.has(comboKey(c.tagIds)))
      .map((c) => ({
        key: comboKey(c.tagIds),
        combo: c,
        pinned: false,
        onTogglePin: () => pin.mutate({ tagIds: c.tagIds, optimistic: c }),
        onRefresh: refreshCombos,
        onDismiss: () => dismiss.mutate(c.tagIds),
      })),
  ];

  const comboColumns: LedgerColumn<ComboRow>[] = [
    { key: 'pin', width: 16, render: (r) => (r.pinned ? <span title="закреплено">■</span> : '') },
    {
      key: 'combo',
      header: 'Комбинация',
      render: (r) => <TagCombo names={r.combo.tagNames} colors={r.combo.colors} />,
    },
    {
      key: 'trades',
      header: 'Сделок',
      align: 'right',
      cellClassName: 'n',
      render: (r) =>
        r.combo.trades < MIN_N ? <span className="dbt">{r.combo.trades} †</span> : r.combo.trades,
    },
    { key: 'wins', header: 'Побед', align: 'right', cellClassName: 'n', render: (r) => r.combo.wins },
    {
      key: 'winrate',
      header: 'Винрейт и нижняя граница',
      label: 'Винрейт',
      width: 200,
      render: (r) => <ConfidenceTrack winRate={r.combo.winRate} wilsonLow={r.combo.wilsonLow} />,
    },
    {
      key: 'avg',
      header: 'Средняя',
      align: 'right',
      cellClassName: 'n',
      render: (r) => <span className={moneyClass(r.combo.avgPnl)}>{formatMoney(r.combo.avgPnl)}</span>,
    },
    {
      key: 'total',
      header: 'Итог',
      align: 'right',
      cellClassName: 'n',
      render: (r) => (
        <span className={moneyClass(r.combo.totalPnl)} style={{ fontSize: 'var(--t-m)' }}>
          {formatMoney(r.combo.totalPnl)}
        </span>
      ),
    },
    {
      key: 'acts',
      width: 210,
      render: (r) => (
        <span className="acts">
          <button className="btn bare" onClick={r.onTogglePin}>
            {r.pinned ? 'открепить' : 'закрепить'}
          </button>
          {r.onDismiss && (
            <button className="btn bare" onClick={r.onDismiss}>
              скрыть
            </button>
          )}
          <button className="btn bare" title="пересчитать" onClick={r.onRefresh}>
            ⟳
          </button>
          {r.onDelete && (
            <button className="btn bare" title="удалить" onClick={r.onDelete}>
              ✕
            </button>
          )}
        </span>
      ),
    },
  ];

  const tagColumns: LedgerColumn<TagBucket>[] = [
    {
      key: 'name',
      header: 'Тег',
      render: (t) =>
        // Строка «без тегов» — не тег: её нельзя ни переименовать, ни удалить.
        t.id == null ? (
          <span style={{ color: 'var(--color-muted)' }}>{t.name}</span>
        ) : (
          <button
            title="Переименовать или сменить категорию"
            style={{ appearance: 'none', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
            onClick={() => {
              const tag = (tagsData?.tags ?? []).find((x) => x.id === t.id);
              if (tag) setEditing(tag);
            }}
          >
            <Tag name={t.name} color={t.color} />
          </button>
        ),
    },
    {
      key: 'type',
      header: 'Категория',
      render: (t) => (
        <span style={{ color: 'var(--color-muted)' }}>{t.type ? TAG_TYPE_LABELS[t.type] : '—'}</span>
      ),
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
      render: (t) => (
        <span className={moneyClass(t.totalPnl)} style={{ fontSize: 'var(--t-m)' }}>
          {formatMoney(t.totalPnl)}
        </span>
      ),
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
          <button
            className="btn bare"
            title="Удалить тег"
            onClick={() =>
              setConfirm({
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
          </button>
        ),
    },
  ];

  return (
    <Wrap style={{ paddingBottom: 'var(--s6)' }}>
      <div className="pagehead">
        <div>
          <h1>Теги</h1>
          <p className="lede">
            Разметка сделок и статистика по ней. Комбинации система предлагает сама — по тому, что реально
            встречалось вместе.
          </p>
        </div>
      </div>

      <div className="strip" style={{ marginBottom: 'var(--s4)' }}>
        <PeriodRail
          title="Теги за период"
          days={days}
          customDate={customDate}
          customActive={customActive}
          trades={statsData?.totalTrades}
          onSelectDays={setDays}
          onCustomDate={setCustomDate}
        />
      </div>

      <div className="h2row">
        <h2>Комбинации</h2>
        <button className="btn bare" onClick={() => setComboDialog(true)}>
          + комбинация вручную
        </button>
      </div>

      <LedgerTable
        columns={comboColumns}
        rows={comboRows}
        rowKey={(r) => r.key}
        minWidth={980}
        empty="Пока нет ни одного сочетания из двух и более тегов."
      />

      <p className="foot">
        <b>†</b> Треугольник — измеренный винрейт, янтарная риска — нижняя граница при 95 %. Чем короче
        выборка, тем дальше они расходятся: шесть сделок со 100 % гарантируют не больше 54 %. Крестиком
        помечены комбинации короче {MIN_N} сделок — им доверять рано.
      </p>

      <div style={{ marginTop: 'var(--s5)' }}>
        <div className="h2row">
          <h2>Все теги</h2>
          <input
            className="in"
            placeholder="поиск по названию…"
            style={{ maxWidth: 190 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <NewTagRow />

        <LedgerTable
          columns={tagColumns}
          rows={tagRows}
          rowKey={(t) => t.id ?? t.name}
          minWidth={900}
          sort={sort}
          onSort={(key) =>
            setSort((s) => (s.key === key ? { key: s.key, dir: (s.dir * -1) as 1 | -1 } : { key: key as SortKey, dir: -1 }))
          }
          empty={search ? 'Ни один тег не подошёл под поиск.' : 'За этот период сделок с тегами нет.'}
        />
      </div>

      {editing && <EditTagDialog tag={editing} onClose={() => setEditing(null)} />}
      {comboDialog && (
        <CreateComboDialog
          tags={tagsData?.tags ?? []}
          isPending={pin.isPending}
          onCreate={(tagIds) => {
            pin.mutate({ tagIds });
            setComboDialog(false);
          }}
          onClose={() => setComboDialog(false)}
        />
      )}
      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </Wrap>
  );
}

/**
 * Создание тега — одной строкой, а не столбиком полей: имя и категория, и всё.
 * Цвет не выбирается — его назначает сервер (см. TagsService.pickColor), чтобы
 * два тега не оказались одного оттенка и палитра не расползалась.
 */
function NewTagRow() {
  const [name, setName] = useState('');
  const [type, setType] = useState<TagType>('setup');
  const create = useCreateTag();

  const submit = () => {
    if (!name.trim()) return;
    create.mutate({ name: name.trim(), type }, { onSuccess: () => setName('') });
  };

  return (
    <div className="newrow">
      <span className="lbl">новый тег</span>
      <input
        className="in"
        placeholder="название"
        maxLength={30}
        style={{ flex: 1, minWidth: 130 }}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <select className="in" value={type} onChange={(e) => setType(e.target.value as TagType)}>
        {TAG_TYPES.map((t) => (
          <option key={t} value={t}>
            {TAG_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      <button className="btn solid" disabled={!name.trim() || create.isPending} onClick={submit}>
        Создать
      </button>
      {create.isError && <span className="neg">{(create.error as Error).message}</span>}
    </div>
  );
}
