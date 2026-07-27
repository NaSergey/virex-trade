'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Pin, PinOff, Pencil, X, MoreVertical, Trash2, RefreshCw } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  useTags,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
  useTagStats,
  useTagComboStats,
  useCreateSavedCombo,
  useUpdateSavedCombo,
  useDeleteSavedCombo,
  useDismissCombo,
  TAG_TYPES,
  TAG_TYPE_LABELS,
  type TagItem,
  type TagType,
  type TagBucket,
  type TagComboBucket,
} from '@/shared/api/tags/hooks';
import { useConfirmAction } from '@/shared/lib/hooks/useConfirmAction';
import { cn } from '@/shared/lib/utils/css';
import { TagChip } from '@/shared/ui/TagChip';
import { Input } from '@/shared/ui/Input';
import { DataTable } from '@/shared/ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { TagPickerGrid, type TagPickerItem } from '@/shared/ui/TagPickerGrid';
import { ModalFooterActions } from '@/shared/ui/ModalFooterActions';
import { TermWindow } from '@/page/stats/TermWindow';
import { Sparkline } from '@/page/stats/Sparkline';
import { ConfidenceTrack } from '@/page/stats/ConfidenceTrack';
import { formatPnl, pnlColor } from '@/shared/lib/utils/format';

type SortKey = 'trades' | 'winRate' | 'profitFactor' | 'avgWin' | 'avgLoss' | 'totalPnl';

function SortableHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: 1 | -1; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex cursor-pointer items-center gap-1 font-mono tracking-wide uppercase hover:text-fg">
      {label}
      <span className={active ? 'text-fg' : 'opacity-40'}>{active ? (dir === 1 ? '▲' : '▼') : '▼'}</span>
    </button>
  );
}

/** Тег-чип для создания нового тега: инпут + плюсик, той же формы и высоты,
 * что и обычные TagChip рядом — читается как «ещё один чип» в общей строке. */
function CreateTagChip() {
  const [name, setName] = useState('');
  const create = useCreateTag();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        create.mutate({ name: name.trim(), type: 'setup' }, { onSuccess: () => setName('') });
      }}
      className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2 py-0.5 focus-within:border-accent-2/60"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Новый тег"
        maxLength={30}
        className="w-20 bg-transparent text-[10px] text-fg placeholder:text-subtle outline-none"
      />
      <button
        type="submit"
        disabled={!name.trim() || create.isPending}
        title="Создать тег"
        className="cursor-pointer text-muted transition-colors hover:text-fg disabled:cursor-default disabled:opacity-40"
      >
        <Plus className="h-3 w-3" />
      </button>
    </form>
  );
}

/** Чип тега в «Мои теги»: имя + счётчик сделок + изменить/удалить. В отличие
 * от read-only TagChip (используется в карточках/таблице сделок), этот живёт
 * только здесь — управление тегами, а не просто отображение. */
function ManagedTagChip({ tag, onEdit, onDelete }: { tag: TagItem; onEdit: () => void; onDelete: () => void }) {
  const deleteConfirm = useConfirmAction();

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium text-fg"
      style={{ borderColor: `${tag.color}80`, background: `${tag.color}26` }}
    >
      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tag.color }} />
      {tag.name}
      <span className="text-[10px] text-subtle">({tag.tradesCount ?? 0})</span>
      <button
        type="button"
        onClick={onEdit}
        title="Изменить тег"
        className="cursor-pointer text-muted transition-colors hover:text-fg"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={() => deleteConfirm.requestOrConfirm(tag.id, onDelete)}
        title={deleteConfirm.isConfirming(tag.id) ? 'Точно удалить?' : 'Удалить тег'}
        className={cn(
          'cursor-pointer transition-colors',
          deleteConfirm.isConfirming(tag.id) ? 'text-down' : 'text-muted hover:text-down',
        )}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </span>
  );
}

/** Модалка «изменить тег»: переименовать и/или сменить категорию. */
function EditTagModal({ tag, onClose }: { tag: TagItem; onClose: () => void }) {
  const [name, setName] = useState(tag.name);
  const [type, setType] = useState<TagType>(tag.type ?? 'setup');
  const update = useUpdateTag();

  const submit = () => {
    if (!name.trim()) return;
    update.mutate({ id: tag.id, name: name.trim(), type }, { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Изменить тег</DialogTitle>
        </DialogHeader>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          autoFocus
          className="h-9 w-full rounded-md border border-line bg-app px-2.5 text-sm text-fg placeholder:text-subtle focus:border-accent-2/60 focus:outline-none"
        />
        <div className="inline-flex gap-0.5 rounded-md border border-line bg-elevated p-0.5 text-xs">
          {TAG_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`cursor-pointer rounded px-2 py-1 transition-colors ${type === t ? 'bg-elevated-2 text-fg' : 'text-muted hover:text-fg'}`}
            >
              {TAG_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        {update.isError && <p className="text-[11px] text-down">{(update.error as Error).message}</p>}
        <ModalFooterActions
          onCancel={onClose}
          onConfirm={submit}
          confirmLabel="Сохранить"
          confirmDisabled={!name.trim() || update.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Модалка «новая комбинация»: выбор 2+ тегов из полного списка → создаёт
 * закреплённую карточку (contains-all — считает сделки, несущие все эти
 * теги, а не только их точный набор). В отличие от авто-комбо, которые
 * появляются сами из сделок за период, эту можно завести заранее, даже если
 * такое сочетание тегов ещё ни разу не встречалось вместе.
 */
function CreateComboModal({
  onClose,
  allTags,
  onCreate,
  isPending,
}: {
  onClose: () => void;
  allTags: TagPickerItem[];
  onCreate: (tagIds: string[]) => void;
  isPending: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Новая комбинация</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted">
          Выберите 2 и более тега — карточка будет считать сделки, где встречаются все они, независимо от
          прочих тегов на сделке.
        </p>
        <TagPickerGrid tags={allTags} selected={selected} onToggle={toggle} />
        <ModalFooterActions
          onCancel={onClose}
          onConfirm={() => onCreate([...selected])}
          confirmLabel="Создать"
          confirmDisabled={selected.size < 2 || isPending}
        />
      </DialogContent>
    </Dialog>
  );
}

interface ComboMenuItem {
  label: string;
  icon: typeof Pin;
  onClick: () => void;
  danger?: boolean;
}

function ComboCard({
  data,
  pinned,
  onTogglePin,
  onRefresh,
  onDelete,
  onDismiss,
}: {
  data: TagComboBucket;
  pinned: boolean;
  onTogglePin: () => void;
  onRefresh: () => void;
  /** Saved combo only — hard delete (asks to confirm). */
  onDelete?: () => void;
  /** Auto combo only — hide it from the grid going forward. */
  onDismiss?: () => void;
}) {
  const { tagIds, tagNames, colors, trades, wins, totalPnl, avgPnl, winRate, wilsonLow } = data;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const deleteConfirm = useConfirmAction();
  const DELETE_ID = 'delete';

  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpen]);

  const items: ComboMenuItem[] = [
    pinned
      ? { label: 'Открепить', icon: PinOff, onClick: onTogglePin }
      : { label: 'Закрепить', icon: Pin, onClick: onTogglePin },
    { label: 'Обновить', icon: RefreshCw, onClick: onRefresh },
  ];
  if (onDismiss) items.push({ label: 'Скрыть', icon: X, onClick: onDismiss });
  if (onDelete) {
    items.push({
      label: deleteConfirm.isConfirming(DELETE_ID) ? 'Точно удалить?' : 'Удалить',
      icon: Trash2,
      danger: true,
      onClick: () => deleteConfirm.requestOrConfirm(DELETE_ID, onDelete),
    });
  }

  return (
    <div className="rounded-md border border-line bg-surface p-2.5 transition-colors hover:border-line-strong">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        {/* flex-nowrap + overflow-x-auto вместо переноса на 2-ю строку — карточка
            всегда ровно одной высоты, а не 2 тега вместо 5 прячутся. Скроллбар
            сайт-вайд невидим (globals.css), сам скролл колесом/трекпадом остаётся. */}
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto">
          {pinned && (
            <span title="Закреплено" className="shrink-0">
              <Pin className="h-3 w-3 text-fg" />
            </span>
          )}
          {tagNames.map((n, i) => (
            <span key={tagIds[i] ?? n} className="shrink-0">
              <TagChip name={n} color={colors[i] ?? '#8f8f8f'} size="sm" />
            </span>
          ))}
        </div>
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            title="Действия"
            className="cursor-pointer rounded p-1 text-muted hover:bg-elevated-2 hover:text-fg"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+4px)] z-10 w-40 rounded-lg border border-line-strong bg-elevated p-1 shadow-(--shadow-high)">
              {items.map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    const wasConfirming = item.danger && deleteConfirm.isConfirming(DELETE_ID);
                    item.onClick();
                    if (item.danger && !wasConfirming) return; // arms confirm — keep menu open
                    setMenuOpen(false);
                  }}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-elevated-2',
                    item.danger ? 'text-down' : 'text-fg',
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className={`font-mono text-base font-bold tracking-tight ${pnlColor(totalPnl)}`}>
          {formatPnl(totalPnl)} USDT
        </span>
        <span className="shrink-0 font-mono text-[10.5px] text-subtle">
          {trades} сд · {wins} поб · ср. <span className={pnlColor(avgPnl)}>{formatPnl(avgPnl)}</span>
        </span>
      </div>
      <div className="mt-1.5">
        <ConfidenceTrack winRate={winRate} wilsonLow={wilsonLow} trades={trades} />
      </div>
    </div>
  );
}

export function TagsTab({ days }: { days: number }) {
  const [comboModalOpen, setComboModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagItem | null>(null);
  const [tagSearch, setTagSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'trades', dir: -1 });

  const qc = useQueryClient();
  const { data: tagsData } = useTags();
  const { data: statsData } = useTagStats(days);
  const { data: comboData } = useTagComboStats(days);
  const deleteTag = useDeleteTag();
  const pin = useCreateSavedCombo();
  const unpin = useUpdateSavedCombo();
  const deleteSavedCombo = useDeleteSavedCombo();
  const dismiss = useDismissCombo();
  const refreshCombos = () => qc.invalidateQueries({ queryKey: ['tagComboStats'] });

  const rows = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    let list = statsData?.tags ?? [];
    if (q) list = list.filter((t) => t.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => (a[sort.key] - b[sort.key]) * sort.dir);
  }, [statsData, sort, tagSearch]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: -1 }));

  const columns: ColumnDef<TagBucket>[] = [
    { accessorKey: 'name', header: 'Тег', cell: ({ row }) => <TagChip name={row.original.name} color={row.original.color} size="sm" /> },
    {
      accessorKey: 'trades',
      header: () => <SortableHeader label="Сделок" active={sort.key === 'trades'} dir={sort.dir} onClick={() => toggleSort('trades')} />,
      cell: ({ row }) => <span className="text-fg">{row.original.trades}</span>,
    },
    {
      accessorKey: 'winRate',
      header: () => <SortableHeader label="Winrate" active={sort.key === 'winRate'} dir={sort.dir} onClick={() => toggleSort('winRate')} />,
      cell: ({ row }) => (
        <div className="flex flex-col items-end gap-1">
          <span className="text-fg">{row.original.winRate}%</span>
          <span className="text-[10px] text-subtle">LB {row.original.wilsonLow}%</span>
        </div>
      ),
    },
    {
      accessorKey: 'profitFactor',
      header: () => <SortableHeader label="PF" active={sort.key === 'profitFactor'} dir={sort.dir} onClick={() => toggleSort('profitFactor')} />,
      cell: ({ row }) => {
        const pf = row.original.profitFactor;
        return (
          <span className={pf >= 1 ? 'text-up' : 'text-down'}>
            {row.original.losses === 0 ? (row.original.wins > 0 ? '∞' : '—') : pf.toFixed(2)}
          </span>
        );
      },
    },
    {
      accessorKey: 'avgWin',
      header: () => <SortableHeader label="Ср. прибыль" active={sort.key === 'avgWin'} dir={sort.dir} onClick={() => toggleSort('avgWin')} />,
      cell: ({ row }) => <span className="text-up">{formatPnl(row.original.avgWin)}</span>,
    },
    {
      accessorKey: 'avgLoss',
      header: () => <SortableHeader label="Ср. убыток" active={sort.key === 'avgLoss'} dir={sort.dir} onClick={() => toggleSort('avgLoss')} />,
      cell: ({ row }) => <span className="text-down">{formatPnl(row.original.avgLoss)}</span>,
    },
    {
      accessorKey: 'totalPnl',
      header: () => <SortableHeader label="P&L" active={sort.key === 'totalPnl'} dir={sort.dir} onClick={() => toggleSort('totalPnl')} />,
      cell: ({ row }) => <span className={`font-semibold ${pnlColor(row.original.totalPnl)}`}>{formatPnl(row.original.totalPnl)}</span>,
    },
    {
      id: 'spark',
      header: '',
      cell: ({ row }) => <Sparkline values={row.original.equity.map((p) => p.value)} color={row.original.totalPnl >= 0 ? 'var(--color-up)' : 'var(--color-down)'} />,
    },
  ];

  const savedIds = new Set((comboData?.saved ?? []).map((s) => [...s.tagIds].sort().join('|')));
  const autoCombos = (comboData?.combos ?? []).filter((c) => !savedIds.has([...c.tagIds].sort().join('|')));
  // Закреплённые — первыми: открепление не убирает карточку (см. ComboCard),
  // поэтому без этой сортировки пин/анпин никак не отражался бы на порядке.
  const savedCombos = [...(comboData?.saved ?? [])].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.trades - a.trades || b.winRate - a.winRate,
  );
  const combosCount = savedCombos.length + autoCombos.length;

  return (
    <>
      <section className="mb-3 flex flex-wrap items-center gap-1.5">
        {(tagsData?.tags ?? []).map((t) => (
          <ManagedTagChip
            key={t.id}
            tag={t}
            onEdit={() => setEditingTag(t)}
            onDelete={() => deleteTag.mutate(t.id)}
          />
        ))}
        <CreateTagChip />
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="font-mono text-[11px] font-bold tracking-wide text-subtle uppercase">
            tags/combos/ ({combosCount})
          </div>
          <button
            onClick={() => setComboModalOpen(true)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-line px-1.5 py-0.5 text-[10px] font-medium text-fg transition-colors hover:border-line-strong hover:bg-elevated"
          >
            <Plus className="h-2.5 w-2.5" /> Комбинация
          </button>
        </div>
        <div className="grid grid-cols-1 items-start gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {savedCombos.map((c) => {
            const pending = c.id.startsWith('pending-');
            return (
              <ComboCard
                key={c.id}
                data={c}
                pinned={c.pinned}
                onTogglePin={() => unpin.mutate({ id: c.id, pinned: !c.pinned })}
                onRefresh={refreshCombos}
                onDelete={pending ? undefined : () => deleteSavedCombo.mutate(c.id)}
              />
            );
          })}
          {autoCombos.map((c) => (
            <ComboCard
              key={c.tagIds.join('|')}
              data={c}
              pinned={false}
              onTogglePin={() => pin.mutate({ tagIds: c.tagIds, optimistic: c })}
              onRefresh={refreshCombos}
              onDismiss={() => dismiss.mutate(c.tagIds)}
            />
          ))}
          {savedCombos.length === 0 && autoCombos.length === 0 && (
            <span className="text-xs text-subtle">Пока нет комбинаций из 2+ тегов</span>
          )}
        </div>
      </section>

      <section className="mt-4">
        <TermWindow tight>
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 pb-0">
            <Input value={tagSearch} onChange={setTagSearch} placeholder="поиск тега…" fullWidth={false} className="w-52" />
            <span className="text-[10.5px] text-subtle">
              {tagSearch ? `${rows.length} / ${statsData?.tags.length ?? 0}` : `${statsData?.tags.length ?? 0} тегов`}
            </span>
          </div>
          <div className="mt-2.5">
            <DataTable data={rows} columns={columns} noDataContent={<div className="py-4 text-sm text-muted">Нет сделок с тегами за период</div>} />
          </div>
        </TermWindow>
      </section>

      {comboModalOpen && (
        <CreateComboModal
          onClose={() => setComboModalOpen(false)}
          allTags={tagsData?.tags ?? []}
          isPending={pin.isPending}
          onCreate={(tagIds) => {
            pin.mutate({ tagIds });
            setComboModalOpen(false);
          }}
        />
      )}

      {editingTag && <EditTagModal tag={editingTag} onClose={() => setEditingTag(null)} />}
    </>
  );
}
