'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/features/auth';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader, useDialogFade } from '@/shared/ui/dialog';
import { Wrap } from '@/shared/ui/Wrap';
import { SessionsList } from './components/SessionsList';
import { StartSession } from './components/StartSession';
import { StatsBlock } from './components/StatsBlock';
import {
  pruneDrawings,
  useBacktestSessions,
  useBacktestStats,
  useDeleteSession,
  type SessionListItem,
} from '@/widgets/backtest-session';

/**
 * Бектест — ручная прокрутка случайного отрезка истории BTC.
 *
 * Список сессий и общая статистика слева, новая сессия справа. Открытая
 * сессия — отдельный адрес `/backtest/<id>` (см. `app/(app)/backtest/[id]`),
 * а не состояние этой страницы: иначе переход по шапке на `/backtest` из
 * открытой сессии не менял адрес и ничего не происходил.
 */
export function BacktestPage() {
  const t = useTranslations('backtest');
  const router = useRouter();
  const sessions = useBacktestSessions();
  const stats = useBacktestStats('real');
  const { user } = useAuth();
  const deleteSession = useDeleteSession();
  const [deleting, setDeleting] = useState<SessionListItem | null>(null);
  const { closing, close } = useDialogFade(() => setDeleting(null));

  // Рисунки удалённых сессий лежат в localStorage, пока их не убрать: чистим по
  // свежему списку, только ключи этого пользователя.
  const list = sessions.data?.sessions;
  useEffect(() => {
    if (!list || !user) return;
    try {
      pruneDrawings(localStorage, user.id, new Set(list.map((s) => s.id)));
    } catch {
      // Хранилище недоступно (приватный режим) — чистить нечего.
    }
  }, [list, user]);

  const openSession = (id: string) => router.push(`/backtest/${id}`);

  return (
    <Wrap page style={{ paddingTop: 'var(--s4)' }}>
      <div className="asym">
        <div>
          <SessionsList
            sessions={sessions.data?.sessions ?? []}
            isLoading={sessions.isLoading}
            onOpen={openSession}
            onDelete={setDeleting}
          />
          <StatsBlock stats={stats.data} isLoading={stats.isLoading} />
        </div>
        <div className="marg">
          <StartSession onStarted={openSession} />
        </div>
      </div>

      {/* Не «навсегда, наберите слово»: сессия — черновик попытки, а не запись
          с последствиями для чужих данных, и большинство удаляемых сессий —
          пустые прогоны без единой сделки. Обычное подтверждение здесь не
          рефлекс, который стоит гасить, а нормальный вес действия. */}
      {deleting && (
        <Dialog open={!closing} onOpenChange={(v) => !v && close()}>
          {/* Кромка цветом убытка — тот же приём, что у ConfirmDialog: окно
              необратимого опознаётся раньше, чем прочитан заголовок. */}
          <DialogContent className="dlg-risk">
            <DialogHeader title={t('deleteSessionTitle')} subtitle={t('deleteSessionSubtitle')} />
            <DialogBody />
            <DialogActions
              confirmLabel={t('deleteSession')}
              confirmVariant="risk"
              onConfirm={() => {
                deleteSession.mutate(deleting.id);
                close();
              }}
              onCancel={close}
            />
          </DialogContent>
        </Dialog>
      )}
    </Wrap>
  );
}
