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
import {
  useClearDay,
  useCopyDay,
  useDeleteBlock,
  usePlanState,
  useRemoveFromDay,
  useSaveBlock,
  useSplitBlock,
  useTemplate,
  type Block,
  type Category,
} from './api/hooks';
import { BlockForm, type BlockValue, type Scope } from './components/BlockForm';
import { WEEKDAYS, daysLabel, duration, endLabel, hhmm, weekdayOf } from './model/time';

const ALL = -1;
const FULL = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];

/**
 * Шаблон недели: из него собирается каждый новый день. Каждый день недели
 * настраивается сам: общий блок («будни») правится только в открытом дне или во
 * всех его днях, день копируется на другие и очищается. Правка меняет будущие
 * дни, которые не правили руками; сегодняшний — «Пересобрать» на «Сегодня»,
 * потому что на него уже могли ответить.
 */
export function TemplatePage() {
  const state = usePlanState();
  const template = useTemplate();
  const [weekday, setWeekday] = useState<number | null>(null);

  const head = (
    <PageHead
      title="Шаблон недели"
      lede="Каждый день недели настраивается отдельно; из шаблона собирается каждый новый день"
    />
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
  // Открывается сегодняшний день недели — его чаще всего и правят.
  const wd = weekday ?? weekdayOf(state.data.today);
  return (
    <>
      {head}
      <WeekGrid blocks={template.data} categories={state.data.categories} selected={wd} onSelect={setWeekday} />
      <Seg
        className="pl-week"
        ariaLabel="День недели"
        value={wd}
        onChange={setWeekday}
        options={[...WEEKDAYS.map((d, i) => ({ value: i, label: d })), { value: ALL, label: 'Все' }]}
      />
      <DayEditor key={wd} weekday={wd} blocks={template.data} categories={state.data.categories} />
    </>
  );
}

/**
 * Неделя одним взглядом — семь колонок блоков (только с мышью и на широком
 * экране; на телефоне — вкладки дней). Колонка открывает свой день.
 */
function WeekGrid({
  blocks,
  categories,
  selected,
  onSelect,
}: {
  blocks: Block[];
  categories: Category[];
  selected: number;
  onSelect: (wd: number) => void;
}) {
  const cats = new Map(categories.map((c) => [c.id, c]));
  return (
    <div className="pl-grid" role="group" aria-label="Неделя">
      {WEEKDAYS.map((d, i) => {
        const day = blocks.filter((b) => b.days & (1 << i));
        const tracked = day.filter((b) => b.track).reduce((s, b) => s + b.endMin - b.startMin, 0);
        return (
          <Button
            key={d}
            variant="none"
            className="pl-grid-col"
            aria-pressed={selected === i}
            onClick={() => onSelect(i)}
          >
            <span className="pl-grid-head">
              {d} <span className="muted">{tracked ? duration(tracked) : '—'}</span>
            </span>
            {day.map((b) => (
              <span key={b.id} className={cn('pl-grid-row', !b.track && 'muted')}>
                <span className="pl-grid-t">{hhmm(b.startMin)}</span> {cats.get(b.category)?.emoji} {b.title}
              </span>
            ))}
          </Button>
        );
      })}
    </div>
  );
}

function DayEditor({ weekday, blocks: all, categories }: { weekday: number; blocks: Block[]; categories: Category[] }) {
  const save = useSaveBlock();
  const split = useSplitBlock();
  const remove = useRemoveFromDay();
  const del = useDeleteBlock();
  const copy = useCopyDay();
  const clear = useClearDay();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [copyTo, setCopyTo] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  const isAll = weekday === ALL;
  const bit = isAll ? 0 : 1 << weekday;
  const cats = new Map(categories.map((c) => [c.id, c]));
  const blocks = all.filter((b) => isAll || b.days & bit);
  const tracked = blocks.filter((b) => b.track).reduce((s, b) => s + b.endMin - b.startMin, 0);
  const busy = save.isPending || split.isPending || remove.isPending || del.isPending;
  const error = save.error ?? split.error ?? remove.error ?? del.error;
  const done = { onSuccess: () => setEditing(null) };

  const submit = (b: Block | undefined, v: BlockValue, scope: Scope) => {
    // Общий блок, правка «только этот день» — делится на этот день и остальные.
    if (b && !isAll && b.days !== bit && scope === 'day') {
      // Дни не едут: сервер ставит копии ровно открытый день (лишнее поле — 400).
      const { title, category, startMin, endMin, track, tasks } = v;
      split.mutate({ id: b.id, weekday, block: { title, category, startMin, endMin, track, tasks } }, done);
    } else {
      save.mutate({ id: b?.id ?? null, block: v }, done);
    }
  };

  const formOf = (b?: Block) => {
    const shared = b && !isAll && b.days !== bit;
    return (
      <BlockForm
        initial={b ?? (isAll ? undefined : { days: bit })}
        categories={categories}
        withDays
        scopeDay={shared ? WEEKDAYS[weekday].toLowerCase() : undefined}
        busy={busy}
        error={error}
        onSave={(v, scope) => submit(b, v, scope)}
        onCancel={() => setEditing(null)}
        onDelete={
          b ? () => (shared ? remove.mutate({ id: b.id, weekday }, done) : del.mutate(b.id, done)) : undefined
        }
        deleteLabel={shared ? `Убрать из ${WEEKDAYS[weekday].toLowerCase()}` : 'Удалить'}
        onDeleteEverywhere={shared ? () => del.mutate(b.id, done) : undefined}
      />
    );
  };

  return (
    <>
      {!isAll && (
        <div className="pl-daytools">
          <span className="muted">
            {blocks.length ? `${blocks.length} блоков · отслеживается ${duration(tracked)}` : 'Блоков нет'}
          </span>
          <span className="pl-grow" />
          {blocks.length > 0 && copyTo == null && (
            <Button variant="bare" tight onClick={() => setCopyTo(0)}>
              Скопировать на…
            </Button>
          )}
          {blocks.length > 0 &&
            (clearing ? (
              <>
                <Button variant="risk" disabled={clear.isPending} onClick={() => clear.mutate(weekday, { onSuccess: () => setClearing(false) })}>
                  Очистить {WEEKDAYS[weekday].toLowerCase()}
                </Button>
                <Button variant="bare" tight onClick={() => setClearing(false)}>
                  Отмена
                </Button>
              </>
            ) : (
              <Button variant="bare" tight onClick={() => setClearing(true)}>
                Очистить день
              </Button>
            ))}
        </div>
      )}

      {!isAll && copyTo != null && (
        <div className="pl-copy">
          <p className="pl-note">
            План на {FULL[weekday]} заменит план выбранных дней. Общие блоки останутся общими — правка потом
            ляжет во все дни.
          </p>
          <div className="pl-days">
            {WEEKDAYS.map((d, i) =>
              i === weekday ? null : (
                <Button
                  key={d}
                  variant="none"
                  className="pl-day"
                  aria-pressed={(copyTo & (1 << i)) !== 0}
                  onClick={() => setCopyTo(copyTo ^ (1 << i))}
                >
                  {d}
                </Button>
              ),
            )}
          </div>
          <ErrorNote error={copy.error} fallback="Не удалось скопировать" />
          <div className="pl-form-actions">
            <span className="pl-grow" />
            <Button variant="bare" onClick={() => setCopyTo(null)}>
              Отмена
            </Button>
            <Button
              variant="solid"
              disabled={copyTo === 0 || copy.isPending}
              onClick={() => copy.mutate({ from: weekday, to: copyTo }, { onSuccess: () => setCopyTo(null) })}
            >
              Скопировать
            </Button>
          </div>
        </div>
      )}
      <ErrorNote error={clear.error} fallback="Не удалось очистить день" />

      {blocks.length === 0 && editing !== 'new' ? (
        <EmptyState title={isAll ? 'Шаблон пуст' : `На ${FULL[weekday]} блоков нет`}>
          Добавьте блоки: время, что делаю, пункты — или скопируйте сюда другой день. Напоминание придёт в
          Telegram в начале каждого отслеживаемого блока.
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
          <Button onClick={() => setEditing('new')}>
            + Блок{isAll ? '' : ` на ${WEEKDAYS[weekday].toLowerCase()}`}
          </Button>
        </div>
      )}
    </>
  );
}
