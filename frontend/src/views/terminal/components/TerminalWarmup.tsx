'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { terminalAccessQuery } from '@/entities/terminal';
import { DEMO_EMAIL, useAuth } from '@/features/auth';
import {
  backtestSessionQuery,
  backtestSessionsQuery,
  liveSymbolsQuery,
  prefetchLiveFeed,
  readLiveSymbol,
} from '@/widgets/backtest-session';
import { EXCHANGE_SOURCE, terminalStateQuery, terminalSymbolsQuery } from '../api/hooks';
import { demoSessionOf, readDemoChoice } from '../model/demo';

/** Сколько ждать простоя браузера, прежде чем греть всё равно. */
const IDLE_TIMEOUT_MS = 3000;

/** Настоящий счёт: снимок, монеты Bybit и свечи монеты графика. */
async function warmExchange(qc: QueryClient, symbol: string) {
  await Promise.all([
    qc.prefetchQuery(terminalStateQuery),
    qc.prefetchQuery(terminalSymbolsQuery),
    prefetchLiveFeed(symbol, EXCHANGE_SOURCE),
  ]);
}

/**
 * Демо-счёт: его эфирная сессия, монеты и свечи рынка продукта. Сессии, которой
 * ещё нет, прогрев не заводит — это делает сам терминал (`DemoTerminal`).
 */
async function warmDemo(qc: QueryClient, symbol: string) {
  const [list] = await Promise.all([
    qc.fetchQuery(backtestSessionsQuery),
    qc.prefetchQuery(liveSymbolsQuery),
    prefetchLiveFeed(symbol),
  ]);
  const session = demoSessionOf(list.sessions);
  if (session) await qc.prefetchQuery(backtestSessionQuery(session.id));
}

/** Тот же выбор экрана, что у страницы терминала (`TerminalPage`): демо-аккаунт, биржа, выбранный демо-счёт. */
async function warm(qc: QueryClient, user: { id: string; email: string }) {
  const symbol = readLiveSymbol();
  if (user.email === DEMO_EMAIL) return warmDemo(qc, symbol);
  // Сбой запроса доступа выбравшему демо не мешает — как и на самой странице.
  const access = await qc.fetchQuery(terminalAccessQuery).catch(() => null);
  if (access?.available) return warmExchange(qc, symbol);
  if (readDemoChoice() === user.id) return warmDemo(qc, symbol);
}

/**
 * Прогрев терминала. Терминал — главная страница и открывается без заглушек
 * (владелец 2026-10-17), в том числе у того, кто открыл приложение на другой
 * странице — по ссылке из уведомления или закладке на дневник: пока он там,
 * счёт, монеты и свечи терминала уже ложатся в кэш (`feedMemory` и кэш
 * запросов), и первый переход на терминал рисует его сразу.
 *
 * Один раз на загрузку вкладки и на пользователя, в простой браузера — время
 * открытой страницы прогрев не отнимает. Открывший сразу терминал прогрева не
 * получает: страница грузит всё сама. Сбой молчит: терминал загрузится сам,
 * как раньше.
 */
export function TerminalWarmup() {
  const { user } = useAuth();
  const pathname = usePathname();
  const qc = useQueryClient();
  const warmedFor = useRef<string | null>(null);
  const id = user?.id;
  const email = user?.email;
  const onTerminal = pathname === '/terminal';

  useEffect(() => {
    if (!id || !email || warmedFor.current === id) return;
    if (onTerminal) {
      warmedFor.current = id;
      return;
    }
    const run = () => {
      warmedFor.current = id;
      void warm(qc, { id, email }).catch(() => undefined);
    };
    if (window.requestIdleCallback) {
      const handle = window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(run, 0);
    return () => window.clearTimeout(handle);
  }, [qc, id, email, onTerminal]);

  return null;
}
