'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useProfile } from '@/entities/profile';
import { useAuth } from '@/features/auth';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { GuestBar } from './components/GuestBar';
import { GuestGate } from './components/GuestGate';
import { Identity } from './components/Identity';
import { ProfileSkeleton } from './components/ProfileSkeleton';
import { ProfileTabs } from './components/ProfileTabs';
import { SeasonLevel } from './components/SeasonLevel';
import { StatCells } from './components/StatCells';
import { Stripe } from './components/Stripe';

/**
 * Профиль игрока — `/profile/<id>` (свой тоже: `/profile` уводит сюда).
 *
 * Карточка игрока в одно окно без прокрутки (спека 2026-10-16, вариант A
 * владельца): слева кто это, уровень сезона, четыре клетки и вкладки — их
 * содержимое забирает остаток высоты; справа белая наклонная полоса, место
 * будущего персонажа. Окно уже 1100 или ниже 620 — колонка на всю ширину,
 * полосы нет, страница листается.
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
    <div className="pf-stage games-page">
      <Stripe />
      <div className="pf-card">
        <ErrorNote error={error} fallback={t('loadFailed')} />
        {!data && !error && <ProfileSkeleton />}
        {data && (
          <>
            <Identity profile={data} own={data.user.id === user.id} />
            <SeasonLevel season={data.season} />
            <StatCells profile={data} />
            <ProfileTabs profile={data} />
          </>
        )}
      </div>
    </div>
  );
}
