'use client';

import { useState } from 'react';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/shared/ui/dialog';

export interface ConfirmRequest {
  title: string;
  subtitle: string;
  /** Что именно произойдёт — по пункту на последствие, без обобщений. */
  consequences: string[];
  /** Слово, которое нужно набрать: подтверждение делом, а не рефлексом. */
  word: string;
  onConfirm: () => void;
}

/**
 * Необратимое действие подтверждается набором слова, а не второй кнопкой.
 *
 * Прежний двухшаговый «нажми ещё раз в течение 4 секунд» отличался от обычного
 * клика только скоростью — то есть отменял ошибку темпа, но не ошибку решения,
 * и ничего не сообщал о последствиях. Здесь перечислено, что именно случится, и
 * подтверждение требует прочитать слово и его напечатать.
 */
export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const matches = typed.trim().toUpperCase() === request.word.toUpperCase();

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader title={request.title} subtitle={request.subtitle} />
        <DialogBody>
          <div className="warn">
            <strong style={{ fontWeight: 400 }}>Что произойдёт:</strong>
            <ul>
              {request.consequences.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <div className="field" style={{ marginTop: 'var(--s3)' }}>
            <label className="lbl" htmlFor="confirm-word">
              Для подтверждения введите <span style={{ color: 'var(--color-fg)' }}>{request.word}</span>
            </label>
            <input
              id="confirm-word"
              className="in full"
              autoComplete="off"
              autoFocus
              placeholder={request.word}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <button className="btn bare" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn risk"
            disabled={!matches}
            onClick={() => {
              request.onConfirm();
              onClose();
            }}
          >
            Подтвердить
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
