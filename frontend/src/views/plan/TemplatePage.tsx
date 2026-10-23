'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { PageHead } from '@/shared/ui/PageHead';
import { Seg } from '@/shared/ui/Seg';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import { cn } from '@/shared/lib/utils/css';
import { useDeleteBlock, usePlanState, useSaveBlock, useTemplate, type Block } from './api/hooks';
import { BlockForm, type BlockValue } from './components/BlockForm';
import { WEEKDAYS, daysLabel, duration, endLabel, hhmm, weekdayOf } from './model/time';

const ALL = -1;

/**
 * Шаблон недели: из него собирается каждый новый день. Правка шаблона меняет
 * будущие дни, которые не правили руками; сегодняшний — кнопкой «Пересобрать»
 * на «Сегодня», потому что на него уже могли ответить.
 */
export function TemplatePage() {
  const state = usePlanState();
  const template = useTemplate();
  const save = useSaveBlock();
  const del = useDeleteBlock();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [weekday, setWeekday] = useState<number>(() => (state.data ? weekdayOf(state.data.today) : ALL));

  const head = (
    <PageHead title="Шаблон недели" lede="Из него собирается каждый новый день — день потом можно поправить отдельно" />
  );
  if (!state.data || !template.data) {
    return (
      <>
        {head}
        <ErrorNote error={state.error ?? template.error} fallback="Не удалось загрузить шаблон" />
        <SkeletonLines widths={[100, 100, 70]} />
      </>
    );
  }
  const cats = new Map(state.data.categories.map((c) => [c.id, c]));
  const blocks = template.data.filter((b) => weekday === ALL || b.days & (1 << weekday));
  const tracked = blocks.filter((b) => b.track).reduce((s, b) => s + b.endMin - b.startMin, 0);

  const submit = (id: string | null, v: BlockValue) =>
    save.mutate({ id, block: v }, { onSuccess: () => setEditing(null) });

  const formOf = (b?: Block) => (
    <BlockForm
      initial={b ?? (weekday === ALL ? undefined : { days: 1 << weekday })}
      categories={state.data!.categories}
      withDays
      busy={save.isPending || del.isPending}
      error={save.error ?? del.error}
      onSave={(v) => submit(b?.id ?? null, v)}
      onCancel={() => setEditing(null)}
      onDelete={b ? () => del.mutate(b.id, { onSuccess: () => setEditing(null) }) : undefined}
    />
  );

  return (
    <>
      {head}
      <Seg
        className="pl-week"
        ariaLabel="День недели"
        value={weekday}
        onChange={setWeekday}
        options={[{ value: ALL, label: 'Все' }, ...WEEKDAYS.map((d, i) => ({ value: i, label: d }))]}
      />
      {weekday !== ALL && blocks.length > 0 && (
        <p className="muted pl-note">
          {blocks.length} блоков, отслеживается {duration(tracked)}
        </p>
      )}

      {blocks.length === 0 && editing !== 'new' ? (
        <EmptyState title={weekday === ALL ? 'Шаблон пуст' : `На ${WEEKDAYS[weekday].toLowerCase()} блоков нет`}>
          Добавьте блоки дня: время, что делаю, пункты. Напоминание придёт в Telegram в начале каждого
          отслеживаемого блока.
        </EmptyState>
      ) : (
        <ul className="pl-items">
          {blocks.map((b) =>
            editing === b.id ? (
              <li key={b.id} className="pl-item pl-item-form">
                {formOf(b)}
              </li>
            ) : (
              <li key={b.id} className={cn('pl-item', !b.track && 'pl-item-quiet')}>
                <div className="pl-time">
                  <span>{hhmm(b.startMin)}</span>
                  <span className="muted">{endLabel(b.endMin)}</span>
                </div>
                <div className="pl-body">
                  <div className="pl-head">
                    <span className="pl-title">
                      {cats.get(b.category)?.emoji} {b.title}
                    </span>
                    <Button variant="none" className="pl-edit" aria-label="Изменить блок" onClick={() => setEditing(b.id)}>
                      <Pencil size={14} aria-hidden />
                    </Button>
                  </div>
                  <div className="pl-meta muted">
                    {daysLabel(b.days)} · {cats.get(b.category)?.label} · {duration(b.endMin - b.startMin)}
                    {!b.track && ' · не отслеживается'}
                  </div>
                  {b.tasks.length > 0 && (
                    <ul className="pl-tasks-list pl-tasks-plain">
                      {b.tasks.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      {editing === 'new' ? (
        <div className="pl-item-form pl-new">{formOf()}</div>
      ) : (
        <div className="pl-foot">
          <Button onClick={() => setEditing('new')}>+ Блок</Button>
        </div>
      )}
    </>
  );
}
