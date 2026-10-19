import type { ReactNode } from 'react';
import { AdminChrome } from '../../(internal)/AdminChrome';

/**
 * Страницы админки за входом. Адреса на поддомене — без `/admin`: `proxy.ts`
 * переписывает `admin.<домен>/saved` сюда, в `/admin/saved`. Сам вход
 * (`/login`) — вне этой группы, без обвязки.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminChrome>{children}</AdminChrome>;
}
