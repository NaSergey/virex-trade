'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { trackExit } from '@/entities/game-table';
import { apiJson } from '@/shared/api/http';

/**
 * Отложенные выходы по столам — отменяет их повторный монтаж той же страницы.
 * `done` отпускает тех, кто ждёт выхода (списки столов, `trackExit`).
 */
const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; done: () => void }>();

/** Встать из-за стола, страница которого уже закрыта. */
export async function standUp(qc: QueryClient, tableId: string, viewKey: (id: string) => readonly unknown[]) {
  // Последний снимок стола — со мной на месте, а сокет уже отключён и новый
  // не принесёт; пометка «устарел» неактивный запрос не перечитывает. Без
  // удаления вернувшийся за стол видел себя сидящим, пока не доезжал ответ.
  qc.removeQueries({ queryKey: viewKey(tableId), exact: true });
  await apiJson<unknown>(`/api/games/tables/${tableId}/leave`, { method: 'POST' }).catch(() => undefined);
  // Лобби уже открыто: список столов и баланс в шапке должны увидеть
  // кэшаут, который пришёл после перехода.
  void qc.invalidateQueries({ queryKey: ['game-tables'] });
  void qc.invalidateQueries({ queryKey: ['coins'] });
}

/**
 * Ушёл со страницы стола — встал из-за стола: кэшаут, а посреди раздачи —
 * её ход за уходящего (у покера фолд, у блэкджека оставшиеся руки стоят). Любой уход внутри сайта одинаков — «Столы», пункт меню, «назад» в
 * браузере: сидеть за столом, которого не видишь, значит пропускать ходы по
 * таймауту и держать фишки там, где тебя нет.
 *
 * Выход откладывается на тик и отменяется, если страница того же стола тут
 * же смонтировалась снова: так делает StrictMode в разработке (монтаж →
 * размонтаж → монтаж) и горячая перезагрузка. Без отсрочки игрок вставал бы
 * из-за стола в момент, когда за него сел.
 *
 * Закрытие вкладки и перезагрузка сюда не относятся: на перезагрузке человек
 * возвращается за тот же стол, а отличить её от закрытия нельзя.
 */
export function useLeaveOnExit(tableId: string, seated: boolean, viewKey: (id: string) => readonly unknown[]) {
  const qc = useQueryClient();
  const seatedRef = useRef(seated);
  useLayoutEffect(() => {
    seatedRef.current = seated;
  }, [seated]);

  useEffect(() => {
    const scheduled = pending.get(tableId);
    if (scheduled) {
      // Та же страница смонтировалась снова — выхода не будет.
      clearTimeout(scheduled.timer);
      scheduled.done();
      pending.delete(tableId);
    }
    return () => {
      if (!seatedRef.current) return;
      // Выход регистрируется сразу, в уборке эффекта — раньше, чем открытая
      // следом страница (обычно лобби) спросит списки столов: иначе она
      // успела бы нарисовать себя сидящим за столом.
      let done!: () => void;
      trackExit(new Promise<void>((resolve) => (done = resolve)));
      const timer = setTimeout(() => {
        pending.delete(tableId);
        void standUp(qc, tableId, viewKey).finally(done);
      }, 0);
      pending.set(tableId, { timer, done });
    };
  }, [qc, tableId, viewKey]);
}
