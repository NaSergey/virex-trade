'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { PageHead } from '@/shared/ui/PageHead';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import {
  useAddItem,
  useDay,
  useDeleteItem,
  usePatchItem,
  usePlanState,
  useRebuildDay,
  type Category,
  type Item,
  type PlanState,
} from './api/hooks';
import { BlockForm, type BlockValue } from './components/BlockForm';
import { ItemRow } from './components/ItemRow';
import { addDays, dayLabel, pct } from './model/time';
import { Notices } from './components/Notices';

/** Сегодня: блоки дня с ответами; листается на соседние дни. */
export function TodayPage() {
  const state = usePlanState();
  if (!state.data) {
    return (
      <>
        <PageHead title="Сегодня" />
        <ErrorNote error={state.error} fallback="Не удалось загрузить план" />
        <SkeletonLines widths={[100, 100, 100, 60]} />
      </>
    );
  }
  return <Today state={state.data} />;
}

function Today({ state }: { state: PlanState }) {
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked ?? state.today;
  const view = useDay(day);
  const patch = usePatchItem(day);
  const add = useAddItem(day);
  const del = useDeleteItem();
  const rebuild = useRebuildDay();
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const cats = new Map<string, Category>(state.categories.map((c) => [c.id, c]));
  const items = view.data?.items ?? [];
  const tracked = items.filter((i) => i.track).length;
  const summary = view.data?.summary;
  const isToday = day === state.today;

  const lede = summary
    ? tracked === 0
      ? 'Отслеживаемых блоков нет'
      : `Сделано ${summary.done} из ${tracked}${summary.score != null ? ` · соблюдение ${pct(summary.score)}` : ''}`
    : null;

  const saveNew = (v: BlockValue) =>
    add.mutate(
      { ...v, tasks: v.tasks.map((text) => ({ text, done: false })) },
      { onSuccess: () => setEditing(null) },
    );

  const saveItem = (item: Item, v: BlockValue) =>
    patch.mutate(
      {
        id: item.id,
        patch: {
          title: v.title,
          category: v.category,
          startMin: v.startMin,
          endMin: v.endMin,
          track: v.track,
          // Отметки пунктов переживают правку текста: совпало слово — галочка остаётся.
          tasks: v.tasks.map((text) => ({ text, done: item.tasks.some((t) => t.text === text && t.done) })),
        },
      },
      { onSuccess: () => setEditing(null) },
    );

  return (
    <>
      <PageHead title={isToday ? 'Сегодня' : dayLabel(day)} lede={lede}>
        <div className="pl-daynav">
          <Button variant="none" className="pl-nav" aria-label="Предыдущий день" onClick={() => setPicked(addDays(day, -1))}>
            <ChevronLeft size={18} aria-hidden />
          </Button>
          <span className="pl-daynav-label">{dayLabel(day)}</span>
          <Button variant="none" className="pl-nav" aria-label="Следующий день" onClick={() => setPicked(addDays(day, 1))}>
            <ChevronRight size={18} aria-hidden />
          </Button>
          {!isToday && (
            <Button variant="bare" tight onClick={() => setPicked(null)}>
              Сегодня
            </Button>
          )}
        </div>
      </PageHead>

      <Notices state={state} />
      <ErrorNote error={view.error ?? patch.error ?? rebuild.error} fallback="Не удалось обновить план" />

      {!view.data ? (
        <SkeletonLines widths={[100, 100, 100]} />
      ) : items.length === 0 && editing !== 'new' ? (
        <EmptyState title={day < state.today ? 'В этот день плана не было' : 'План пуст'}>
          {day < state.today
            ? 'Прошлое не собирается из шаблона — можно добавить блок и отметить, что было.'
            : 'Соберите неделю на вкладке «Шаблон» или добавьте блок только на этот день.'}
        </EmptyState>
      ) : (
        <ul className="pl-items">
          {items.map((item) =>
            editing === item.id ? (
              <li key={item.id} className="pl-item pl-item-form">
                <BlockForm
                  initial={{ ...item, tasks: item.tasks.map((t) => t.text) }}
                  categories={state.categories}
                  busy={patch.isPending || del.isPending}
                  error={patch.error ?? del.error}
                  onSave={(v) => saveItem(item, v)}
                  onCancel={() => setEditing(null)}
                  onDelete={() => del.mutate(item.id, { onSuccess: () => setEditing(null) })}
                />
              </li>
            ) : (
              <ItemRow
                key={item.id}
                item={item}
                category={cats.get(item.category)}
                busy={patch.isPending}
                onPatch={(p) => patch.mutate({ id: item.id, patch: p })}
                onEdit={() => setEditing(item.id)}
              />
            ),
          )}
        </ul>
      )}

      {editing === 'new' ? (
        <div className="pl-item-form pl-new">
          <BlockForm
            categories={state.categories}
            busy={add.isPending}
            error={add.error}
            onSave={saveNew}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : (
        <div className="pl-foot">
          <Button onClick={() => setEditing('new')}>+ Блок на этот день</Button>
          {day >= state.today && (
            <Button
              variant="bare"
              disabled={rebuild.isPending}
              title="Блоки без ответа заменятся блоками шаблона; отвеченные останутся"
              onClick={() => rebuild.mutate(day)}
            >
              Пересобрать из шаблона
            </Button>
          )}
          {view.data?.edited && <span className="muted pl-note">День правили руками — шаблон его не меняет.</span>}
        </div>
      )}
    </>
  );
}
