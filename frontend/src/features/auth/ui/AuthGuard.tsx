'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../model/AuthContext';

// Wrap protected content. Redirects to /login when there is no session.
export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading) {
    // Крутящегося колечка тут быть не может: радиус в этой системе нулевой,
    // так что «спиннер» — это квадрат. Ожидание показывается словом.
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span className="lbl">Восстанавливаем сессию…</span>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
