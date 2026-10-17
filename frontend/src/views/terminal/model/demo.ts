'use client';

import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import type { SessionListItem } from '@/widgets/backtest-session';

const DEMO_KEY = 'virex.terminal.demo';
const asIs = (raw: string | null) => raw;

/**
 * Кто выбрал демо-счёт на этом устройстве — id пользователя, а не флаг: иначе
 * выбор одного достался бы следующему вошедшему в том же браузере. Помнится,
 * чтобы каждый заход на терминал не начинался снова с вопроса; путь обратно к
 * бирже — кнопка «Подключить биржу» над графиком демо.
 */
export const useDemoChoice = () => usePersistentValue<string | null>(DEMO_KEY, asIs, null, asIs);

/** Тот же выбор вне React — по нему прогрев терминала решает, что греть. Только в браузере. */
export const readDemoChoice = () => localStorage.getItem(DEMO_KEY);

/** Сессия демо-счёта: эфирная и активная. Нет такой — терминал заведёт новую. */
export const demoSessionOf = (sessions: readonly SessionListItem[]) =>
  sessions.find((s) => s.dataSource === 'live' && s.status === 'active');
