'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Wrap } from '@/shared/ui/Wrap';
import { useBacktestSessions, useBacktestStats } from './api/hooks';
import type { DataSource } from './api/types';
import { SessionScreen } from './components/SessionScreen';
import { SessionsList } from './components/SessionsList';
import { StartSession } from './components/StartSession';
import { StatsBlock } from './components/StatsBlock';
import { pruneDrawings } from './lib/drawings/store';

/**
 * Бектест — ручная прокрутка случайного отрезка истории BTC.
 *
 * Без открытой сессии: слева сессии и общая статистика, справа — новая сессия.
 * С открытой — экран прокрутки. Какая сессия открыта — состояние страницы, а
 * не адрес: useSearchParams потребовал бы Suspense-границу ради одной
 * переменной, а делиться ссылкой на тренировочную сессию незачем.
 *
 * Обёртку в .wrap здесь не ставим безусловно: активная сессия — терминал во
 * всю ширину окна и сама решает про поля страницы (см. SessionScreen).
 */
export function BacktestPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessions = useBacktestSessions();
  const [statsSource, setStatsSource] = useState<DataSource>('real');
  const stats = useBacktestStats(statsSource);
  const { user } = useAuth();

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

  if (sessionId) {
    return <SessionScreen id={sessionId} onLeave={() => setSessionId(null)} />;
  }

  return (
    <Wrap page>
      <div className="asym">
        <div>
          <SessionsList sessions={sessions.data?.sessions ?? []} isLoading={sessions.isLoading} onOpen={setSessionId} />
          <StatsBlock stats={stats.data} isLoading={stats.isLoading} source={statsSource} onSource={setStatsSource} />
        </div>
        <div className="marg">
          <StartSession onStarted={setSessionId} />
        </div>
      </div>
    </Wrap>
  );
}
