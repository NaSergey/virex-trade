'use client';

import { useTranslations } from 'next-intl';
import { useBattlePass } from '@/entities/battle-pass';
import { useAuth } from '@/features/auth';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { PageHead } from '@/shared/ui/PageHead';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Wrap } from '@/shared/ui/Wrap';
import { DailyReward } from './components/DailyReward';
import { HeroCard } from './components/HeroCard';
import { RewardTrack } from './components/RewardTrack';

/**
 * Профиль игрока: герой, уровень сезона, ежедневная награда и лестница наград.
 *
 * Страница обычная, не игровая: чёрное поле, скругления и палитра раздела игр
 * живут только внутри `/games`, а профиль — про учётную запись.
 */
export function ProfilePage() {
  const t = useTranslations('profile');
  const { user } = useAuth();
  const battlePass = useBattlePass();

  return (
    <Wrap page>
      <PageHead title={t('title')} lede={t('lede')} />
      {battlePass.isPending && <Skeleton height={120} />}
      {/* ErrorNote сам ничего не рисует, пока ошибки нет, — условие ему не нужно. */}
      <ErrorNote error={battlePass.error} fallback={t('loadFailed')} />
      {battlePass.data && (
        <>
          <HeroCard state={battlePass.data} name={user?.name || user?.email || ''} />
          <DailyReward daily={battlePass.data.daily} />
          <RewardTrack state={battlePass.data} />
        </>
      )}
    </Wrap>
  );
}
