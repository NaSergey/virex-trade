'use client';

import { useState } from 'react';
import { Wrap } from '@/shared/ui/Wrap';
import { useBacktestSessions, useBacktestStats } from './api/hooks';
import { SessionScreen } from './components/SessionScreen';
import { SessionsList } from './components/SessionsList';
import { StartSession } from './components/StartSession';
import { StatsBlock } from './components/StatsBlock';

/**
 * Бектест — ручная прокрутка случайного отрезка истории BTC.
 *
 * Без открытой сессии: слева сессии и общая статистика, справа — новая сессия.
 * С открытой — экран прокрутки. Какая сессия открыта — состояние страницы, а
 * не адрес: useSearchParams потребовал бы Suspense-границу ради одной
 * переменной, а делиться ссылкой на тренировочную сессию незачем.
 */
export function BacktestPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessions = useBacktestSessions();
  const stats = useBacktestStats();

  if (sessionId) {
    return (
      <Wrap page>
        <SessionScreen id={sessionId} onLeave={() => setSessionId(null)} />
      </Wrap>
    );
  }

  return (
    <Wrap page>
      <div className="asym">
        <div>
          <SessionsList sessions={sessions.data?.sessions ?? []} isLoading={sessions.isLoading} onOpen={setSessionId} />
          <StatsBlock stats={stats.data} isLoading={stats.isLoading} />
        </div>
        <div className="marg">
          <StartSession onStarted={setSessionId} />
        </div>
      </div>
    </Wrap>
  );
}
