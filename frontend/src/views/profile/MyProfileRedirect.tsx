'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth';
import { Skeleton } from '@/shared/ui/Skeleton';

/**
 * `/profile` — только переход на `/profile/<свой id>`. Свой профиль живёт по
 * тому же адресу, что видят другие (требование владельца 2026-10-01): ссылку
 * копируют прямо из строки браузера, и она обязана открываться у кого
 * угодно. `/profile` без id у каждого свой и за входом — делиться им нельзя.
 *
 * `replace`, а не `push`: «назад» не должен возвращать на промежуточный
 * адрес, который тут же снова уведёт вперёд.
 */
export function MyProfileRedirect() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace(`/profile/${user.id}`);
  }, [user, router]);

  return (
    <div className="pf games-page">
      <Skeleton height={92} />
    </div>
  );
}
