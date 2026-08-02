'use client';

import { useState } from 'react';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Field, Input } from '@/shared/ui/Field';

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
 *
 * Разговор идёт сверху вниз: что за действие → что после него будет → чем
 * подтвердить. Последствия стоят ДО поля намеренно: набирать слово, не
 * прочитав, за что, — тот же рефлекс, ради отмены которого диалог и заведён.
 * Раньше они приходили в запросе, но на экран не выводились вовсе — оставалось
 * требование напечатать слово без единого объяснения, зачем.
 */
export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const matches = typed.trim().toUpperCase() === request.word.toUpperCase();

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      {/* Кромка цветом убытка — то единственное, чем окно необратимого
          отличается от обычного диалога ещё до того, как прочитан заголовок. */}
      <DialogContent className="dlg-risk">
        <DialogHeader title={request.title} subtitle={request.subtitle} />
        <DialogBody>
          <Field
            className="cfm-word"
            label={
              <>
                Наберите <span className="cfm-key">{request.word}</span>
              </>
            }
            htmlFor="confirm-word"
          >
            {/* Плейсхолдера нет: он повторял ровно то слово, которое надо
                набрать, и пустое поле выглядело уже заполненным. */}
            <Input
              id="confirm-word"
              full
              autoComplete="off"
              autoFocus
              data-ok={matches}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </Field>
        </DialogBody>
        <DialogActions
          confirmLabel="Подтвердить"
          confirmVariant="risk"
          confirmDisabled={!matches}
          onConfirm={() => {
            request.onConfirm();
            onClose();
          }}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
