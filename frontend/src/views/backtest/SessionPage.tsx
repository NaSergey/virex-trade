'use client';

import { useRouter } from 'next/navigation';
import { SessionScreen } from './components/SessionScreen';

/**
 * Обёртка сессии для адреса `/backtest/<id>` — сама сессия (загрузка, терминал,
 * итог) не знает про роутер, только про `onLeave`.
 */
export function BacktestSessionPage({ id }: { id: string }) {
  const router = useRouter();
  return <SessionScreen id={id} onLeave={() => router.push('/backtest')} />;
}
