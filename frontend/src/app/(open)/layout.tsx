import type { ReactNode } from 'react';
import { OpenShell } from '../(internal)/OpenShell';

/**
 * Страницы, которые рендерятся и без аккаунта: профиль игрока `/profile/<id>`.
 * Гейт `proxy.ts` пропускает этот путь без куки — но **сам профиль гость не
 * видит** (решение владельца 2026-10-02): страница рисует ему приглашение
 * зарегистрироваться, а данные остаются за `JwtAuthGuard`. Группа нужна ровно
 * затем, чтобы эта страница существовала для гостя и могла ему это сказать.
 */
export default function OpenLayout({ children }: { children: ReactNode }) {
  return <OpenShell>{children}</OpenShell>;
}
