'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../model/AuthContext';

/**
 * Реагирует на потерю сессии УЖЕ на странице — не гейт входа.
 *
 * Гейт (единственный, до рендера) — `frontend/middleware.ts`: без куки
 * сессии на защищённую страницу не попасть вообще, редирект на `/login`
 * происходит на edge раньше первого байта разметки. Раз попасть сюда без
 * куки нельзя, этот компонент рисует `children` сразу, не дожидаясь ответа
 * `/auth/refresh`, — двойного гейта (клиент поверх middleware) быть не
 * должно.
 *
 * Но кука на входе — не гарантия рабочей сессии: refresh-токен разовый и
 * может быть просрочен, отозван или уже использован другой вкладкой.
 * Тогда `/auth/refresh` не даёт новый access-токен, `user` становится
 * `null`, и вот этот эффект уводит на `/login` — иначе человек застревал бы
 * на странице, чьи данные `apiFetch` без токена никогда не отдаст.
 *
 * Адрес, на который человек шёл, передаётся входу параметром `next`: ссылку на
 * «Настройки» можно положить в закладки, и возвращать её владельца на Обзор
 * только потому, что сессия истекла, значит терять то, ради чего он пришёл.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, pathname, router]);

  // Проверка закончилась, сессии нет — переход на вход уже начат. Держать в
  // это мгновение заглушки значило бы обещать содержимое, которого не будет.
  if (!loading && !user) return null;

  return <>{children}</>;
}
