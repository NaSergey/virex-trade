'use client';

import { useRouter } from 'next/navigation';
import { SessionScreen } from '@/widgets/backtest-session';

/**
 * Обёртка сессии для адреса `/backtest/<id>` — сама сессия (загрузка, терминал,
 * итог) не знает про роутер, только про `onLeave`.
 */
export function BacktestSessionPage({ id }: { id: string }) {
  const router = useRouter();
  // Сетка графиков — в эфирной сессии (владелец 2026-11-17); у истории и тренажёра график один сам собой.
  return <SessionScreen id={id} onLeave={() => router.push('/backtest')} multiChart />;
}
