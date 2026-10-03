import type { ReactNode } from 'react';
import { getServerTerminalHint } from '@/entities/terminal/server-access';
import { OpenShell } from '../(internal)/OpenShell';

/**
 * Страницы, которые рендерятся и без аккаунта: профиль игрока `/profile/<id>`.
 * Гейт `proxy.ts` пропускает этот путь без куки — но **сам профиль гость не
 * видит** (решение владельца 2026-10-02): страница рисует ему приглашение
 * зарегистрироваться, а данные остаются за `JwtAuthGuard`. Группа нужна ровно
 * затем, чтобы эта страница существовала для гостя и могла ему это сказать.
 *
 * Серверный компонент — ради той же куки «Терминала», что у `(app)`: вошедший
 * видит здесь ту же рейку, и она не должна дорисовываться после ответа API.
 */
export default async function OpenLayout({ children }: { children: ReactNode }) {
  const initialTerminal = await getServerTerminalHint();
  return <OpenShell initialTerminal={initialTerminal}>{children}</OpenShell>;
}
