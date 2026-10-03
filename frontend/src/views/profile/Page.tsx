'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useProfile } from '@/entities/profile';
import { useAuth } from '@/features/auth';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { GuestBar } from './components/GuestBar';
import { GuestGate } from './components/GuestGate';
import { PlayerResults } from './components/PlayerResults';
import { Stripe } from './components/Stripe';

/**
 * Профиль игрока — `/profile/<id>` (свой тоже: `/profile` уводит сюда).
 *
 * Профиль собирается заново по образцу владельца, по одному элементу
 * (2026-10-02): прежние блоки сняты, на экране наклонная полоса на всю
 * страницу и под ней — что человек делал. Иконки достижений (`Achievements`),
 * графики (`TrendChart`, `GameRadar`) и окно наград сезона
 * (`SeasonRewardsDialog`) оставлены компонентами — их вернёт следующий шаг.
 *
 * **Гостю профиля не видно** (решение владельца 2026-10-02): шапка со входом и
 * приглашение зарегистрироваться. Данные и так за `JwtAuthGuard` — здесь только
 * то, что гость об этом читает.
 */
export function ProfilePage() {
  const t = useTranslations('profile');
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const userId = params?.id ?? '';
  // Профиль заказывается только вошедшим: гостю он ответит 401, и спрашивать
  // его значило бы ронять запрос ради заранее известного отказа.
  const { data, error } = useProfile(userId, !!user);

  if (!user) {
    return (
      <>
        <GuestBar />
        <GuestGate />
      </>
    );
  }

  return (
    <>
      <div className="pf-stage games-page">
        <Stripe />
      </div>
      <div className="pf-page wrap">
        <ErrorNote error={error} fallback={t('loadFailed')} />
        {data && <PlayerResults profile={data} />}
      </div>
    </>
  );
}
