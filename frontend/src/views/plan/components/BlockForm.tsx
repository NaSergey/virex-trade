'use client';

import { useState } from 'react';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, Input, Select } from '@/shared/ui/Field';
import { Seg } from '@/shared/ui/Seg';
import type { BlockFields, Category } from '../api/hooks';
import { EVERY_DAY_MASK, WEEKDAYS, WEEKDAYS_MASK, WEEKEND_MASK, endLabel, hhmm, parseHHMM } from '../model/time';

export interface BlockValue extends BlockFields {
  tasks: string[];
  days: number;
}

/** Куда ложится правка общего блока шаблона: только в открытый день или во все его дни. */
export type Scope = 'day' | 'all';

/**
 * Форма блока — одна на шаблон и день: у шаблона есть дни недели (`withDays`),
 * у дня — нет. Пункты — строками в одном поле: на телефоне так быстрее, чем
 * добавлять их по одному.
 */
export function BlockForm({
  initial,
  categories,
  withDays,
  scopeDay,
  busy,
  error,
  onSave,
  onCancel,
  onDelete,
  deleteLabel = 'Удалить',
  onDeleteEverywhere,
}: {
  initial?: Partial<BlockValue>;
  categories: Category[];
  withDays?: boolean;
  /**
   * Блок стоит в нескольких днях, а открыт один из них («Пн»): форма спрашивает,
   * править только его или все дни блока. По умолчанию — только его.
   */
  scopeDay?: string;
  busy?: boolean;
  error?: unknown;
  onSave: (v: BlockValue, scope: Scope) => void;
  onCancel: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
  /** Второе удаление — из всех дней блока (рядом с «Убрать из пн»). */
  onDeleteEverywhere?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState(initial?.category ?? categories[0]?.id ?? 'other');
  const [start, setStart] = useState(initial?.startMin != null ? hhmm(initial.startMin) : '');
  const [end, setEnd] = useState(initial?.endMin != null ? endLabel(initial.endMin) : '');
  const [track, setTrack] = useState(initial?.track ?? true);
  const [tasks, setTasks] = useState((initial?.tasks ?? []).join('\n'));
  const [days, setDays] = useState(initial?.days ?? WEEKDAYS_MASK);
  const [scope, setScope] = useState<Scope>('day');
  const showDays = withDays && (!scopeDay || scope === 'all');

  const startMin = parseHHMM(start);
  const endMin = parseHHMM(end, true);
  const problem = !title.trim()
    ? 'Название'
    : startMin == null || endMin == null
      ? 'Время начала и конца'
      : endMin <= startMin
        ? 'Конец позже начала (через полночь — двумя блоками)'
        : showDays && days === 0
          ? 'Хотя бы один день недели'
          : null;

  const save = () => {
    if (problem || startMin == null || endMin == null) return;
    onSave(
      {
      title: title.trim(),
      category,
      startMin,
      endMin,
      track,
      days,
      tasks: tasks
        .split('\n')
        .map((t) => t.trim())
        .filter(Boolean),
      },
      scope,
    );
  };

  return (
    <form
      className="pl-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label="Что делаю" className="pl-form-title">
        {(id) => (
          <Input id={id} full value={title} maxLength={120} placeholder="Бектест, английский…" onChange={(e) => setTitle(e.target.value)} />
        )}
      </Field>
      <div className="pl-form-row">
        <Field label="С">
          {(id) => <Input id={id} full type="time" value={start} onChange={(e) => setStart(e.target.value)} />}
        </Field>
        <Field label="До">
          {(id) => <Input id={id} full type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}
        </Field>
        <Field label="Вид">
          {(id) => (
            <Select id={id} full value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      {scopeDay && (
        <Seg
          className="pl-scope"
          ariaLabel="Где менять"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'day', label: `Только ${scopeDay}` },
            { value: 'all', label: 'Во всех днях блока' },
          ]}
        />
      )}
      {showDays && (
        <div className="field">
          <span className="lbl">Дни</span>
          <div className="pl-days">
            {WEEKDAYS.map((d, i) => (
              <Button
                key={d}
                variant="none"
                className="pl-day"
                aria-pressed={(days & (1 << i)) !== 0}
                onClick={() => setDays(days ^ (1 << i))}
              >
                {d}
              </Button>
            ))}
            <span className="pl-days-presets">
              <Button variant="bare" tight onClick={() => setDays(WEEKDAYS_MASK)}>
                будни
              </Button>
              <Button variant="bare" tight onClick={() => setDays(WEEKEND_MASK)}>
                выходные
              </Button>
              <Button variant="bare" tight onClick={() => setDays(EVERY_DAY_MASK)}>
                все
              </Button>
            </span>
          </div>
        </div>
      )}
      <Field label="Пункты — по строке">
        {(id) => (
          <textarea
            id={id}
            className="in full pl-tasks"
            rows={3}
            value={tasks}
            placeholder={'Разобрать 20 сделок\nЗаписать выводы'}
            onChange={(e) => setTasks(e.target.value)}
          />
        )}
      </Field>
      <label className="pl-check">
        <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} />
        <span>Отслеживать — напоминание в Telegram и место в отчёте</span>
      </label>
      <ErrorNote error={error} fallback="Не удалось сохранить" />
      <div className="pl-form-actions">
        {onDelete && (
          <Button variant="risk" onClick={onDelete} disabled={busy}>
            {deleteLabel}
          </Button>
        )}
        {onDeleteEverywhere && (
          <Button variant="bare" onClick={onDeleteEverywhere} disabled={busy}>
            Удалить везде
          </Button>
        )}
        <span className="pl-grow" />
        <Button variant="bare" onClick={onCancel}>
          Отмена
        </Button>
        <Button variant="solid" type="submit" disabled={busy || problem != null} title={problem ?? undefined}>
          Сохранить
        </Button>
      </div>
    </form>
  );
}
