'use client';

import { useState } from 'react';
import { useBattlePass, useClaimDaily } from '@/entities/battle-pass';

/**
 * Открывается сама при заходе на сайт, если сегодняшняя награда ещё не
 * забрана. «Заход» здесь — разворот оболочки `(app)`: она не перемонтируется
 * при переходах между разделами (см. её комментарий), поэтому один разворот
 * на вкладку и есть первый заход за день — без своей отметки в хранилище.
 * Источник правды один, `daily.claimedToday` с сервера; `dismissed` живёт
 * только в памяти этой вкладки и не переживает перезагрузку — закрыв
 * напоминание, при новом заходе в тот же день его увидят снова, пока не
 * заберут.
 */
export function useDailyRewardPrompt() {
  const battlePass = useBattlePass();
  const claim = useClaimDaily();
  const [dismissed, setDismissed] = useState(false);

  const daily = battlePass.data?.daily;
  const open = Boolean(daily && !daily.claimedToday && !dismissed);

  return { open, daily, claim, close: () => setDismissed(true) };
}
