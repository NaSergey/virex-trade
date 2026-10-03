'use client';

import type { ReactNode } from 'react';
import { useAuth } from '@/features/auth';
import { GamesVeil } from '@/widgets/games-veil';
import { AppChrome } from './AppChrome';

/**
 * Оболочка страниц, открытых по ссылке и без входа (профиль игрока). Решает,
 * кто пришёл, когда восстановление сессии закончилось: вошедший получает
 * обычную обвязку приложения с рейкой, гость — только заливку, а свою шапку
 * со «Войти» рисует сама страница.
 *
 * Пока сессия восстанавливается — только заливка: обвязка вошедшего, начав
 * рисоваться гостю, успела бы отправить запросы с ответом 401.
 */
export function OpenShell({ initialTerminal, children }: { initialTerminal: boolean; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <GamesVeil />;
  if (user) return <AppChrome initialTerminal={initialTerminal}>{children}</AppChrome>;
  return (
    <>
      <GamesVeil />
      {children}
    </>
  );
}
