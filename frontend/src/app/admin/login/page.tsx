import { Suspense } from 'react';
import { AdminLoginPage } from '@/views/admin-login/Page';

/**
 * admin.<домен>/login — `proxy.ts` переписывает сюда. Suspense — ради
 * `useSearchParams`: без него сборка требует отказаться от статики всей страницы.
 */
export default function Page() {
  return (
    <Suspense>
      <AdminLoginPage />
    </Suspense>
  );
}
