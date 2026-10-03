'use client';

import { useTranslations } from 'next-intl';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader, useDialogFade } from '@/shared/ui/dialog';

export interface ConfirmRequest {
  title: string;
  subtitle: string;
  /** Что именно произойдёт — по пункту на последствие, без обобщений. */
  consequences: string[];
  onConfirm: () => void;
}

/**
 * Необратимое действие подтверждается отдельным окном с перечисленными
 * последствиями — не вторым кликом по той же кнопке, а решением, принятым
 * после того, как прочитано, что именно случится.
 *
 * Прежде ещё требовалось набрать слово руками: это отличалось от обычного
 * клика скоростью, а не вниманием, и каждое удаление или отключение
 * превращалось в лишний ввод текста там, где достаточно один раз прочитать
 * последствия и нажать кнопку. Снято владельцем 2026-10-01.
 *
 * Разговор идёт сверху вниз: что за действие → что после него будет →
 * кнопка. Последствия стоят в теле окна, а не в подписи, — их может быть
 * несколько, и подпись под заголовком для списка не годится.
 */
export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const t = useTranslations('common');
  const { closing, close } = useDialogFade(onClose);

  return (
    <Dialog open={!closing} onOpenChange={(v) => !v && close()}>
      {/* Кромка цветом убытка — то единственное, чем окно необратимого
          отличается от обычного диалога ещё до того, как прочитан заголовок. */}
      <DialogContent className="dlg-risk">
        <DialogHeader title={request.title} subtitle={request.subtitle} />
        <DialogBody>
          <ul className="cfm-list">
            {request.consequences.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </DialogBody>
        <DialogActions
          confirmLabel={t('confirm')}
          confirmVariant="risk"
          onConfirm={() => {
            request.onConfirm();
            close();
          }}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}
