'use client';

import { Pencil } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/lib/utils/css';
import type { Category, Item, ItemPatch } from '../api/hooks';
import { OUTCOME_LABEL, OUTCOME_TONE, answersFor } from '../model/outcome';
import { duration, endLabel, hhmm } from '../model/time';

const lateText = (late: number | null) =>
  late == null ? '' : late > 0 ? ` · опоздание ${late} мин` : late < 0 ? ' · раньше времени' : ' · вовремя';

/**
 * Блок дня: время, что делаю, пункты и ответы — те же, что кнопки в Telegram.
 * Отвеченный блок ответ не прячет: «сбросить» возвращает его в план, если
 * нажал не то.
 */
export function ItemRow({
  item,
  category,
  busy,
  onPatch,
  onEdit,
}: {
  item: Item;
  category?: Category;
  busy: boolean;
  onPatch: (patch: ItemPatch) => void;
  onEdit: () => void;
}) {
  const o = item.outcome;
  const answers = item.track ? answersFor(o) : [];
  const answered = item.status !== 'planned' && answers.length === 0;
  const live = o === 'now' || o === 'started';

  return (
    <li className={cn('pl-item', live && 'pl-item-live', !item.track && 'pl-item-quiet')} data-outcome={o}>
      <div className="pl-time">
        <span>{hhmm(item.startMin)}</span>
        <span className="muted">{endLabel(item.endMin)}</span>
      </div>
      <div className="pl-body">
        <div className="pl-head">
          <span className="pl-title">
            {category?.emoji} {item.title}
          </span>
          {item.track && <span className={cn('pl-outcome', OUTCOME_TONE[o])}>{OUTCOME_LABEL[o]}</span>}
          <Button variant="none" className="pl-edit" aria-label="Изменить блок" onClick={onEdit}>
            <Pencil size={14} aria-hidden />
          </Button>
        </div>
        <div className="pl-meta muted">
          {category?.label} · {duration(item.endMin - item.startMin)}
          {item.startedAt && ` · сел в ${item.startedAt}${lateText(item.lateMin)}`}
        </div>
        {item.tasks.length > 0 && (
          <ul className="pl-tasks-list">
            {item.tasks.map((t, i) => (
              <li key={i}>
                <label className="pl-check">
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() =>
                      onPatch({ tasks: item.tasks.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })
                    }
                  />
                  <span className={t.done ? 'pl-task-done' : undefined}>{t.text}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {(answers.length > 0 || answered) && (
          <div className="pl-answers">
            {answers.map((a) => (
              <Button
                key={a.status}
                variant={a.main ? 'solid' : 'default'}
                disabled={busy}
                onClick={() => onPatch({ status: a.status })}
              >
                {a.label}
              </Button>
            ))}
            {answered && (
              <Button variant="bare" tight disabled={busy} onClick={() => onPatch({ status: 'planned' })}>
                Сбросить ответ
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
