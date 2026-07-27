'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthContext';

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
    return (
      <div className="flex h-screen w-screen items-center justify-center gap-3 bg-app text-muted">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-fg" />
        Загрузка…
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
