'use client';

import { useDailyRewardPrompt } from '../model/useDailyRewardPrompt';
import { DailyRewardDialog } from './DailyRewardDialog';

/**
 * Приглашение забрать ежедневную награду — всплывает само при первом заходе
 * за день, если она ещё не забрана. То же окно, что открывает кнопка профиля,
 * но идти туда не нужно: точка на кнопке «Профиль» остаётся для тех, кто это
 * окно закрыл, не забрав.
 */
export function DailyRewardPrompt() {
  const { open, daily, close } = useDailyRewardPrompt();
  if (!open || !daily) return null;

  return <DailyRewardDialog daily={daily} onClose={close} />;
}
