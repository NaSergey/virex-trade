'use client';

import { useState } from 'react';
import { useBattlePass } from '@/entities/battle-pass';

/**
 * Открывается сама при заходе на сайт, если сегодняшняя награда ещё не
 * забрана. «Заход» здесь — разворот оболочки `(app)`: она не перемонтируется
 * при переходах между разделами (см. её комментарий), поэтому один разворот
 * на вкладку и есть первый заход за день — без своей отметки в хранилище.
 * Источник правды один, `daily.claimedToday` с сервера; `dismissed` живёт
 * только в памяти этой вкладки и не переживает перезагрузку — закрыв
 * напоминание, при новом заходе в тот же день его увидят снова, пока не
 * заберут.
 *
 * Открытое окно защёлкнуто (`shown`): выдача делает `claimedToday` истиной, и
 * условие «не забрана» сняло бы окно посреди разлёта монет. Закрывает его
 * только сам человек.
 */
export function useDailyRewardPrompt() {
  const battlePass = useBattlePass();
  const [shown, setShown] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const daily = battlePass.data?.daily;
  // Состояние из прошлого рендера — приём из документации React, а не
  // эффект: окно встаёт в том же проходе, в котором пришли данные.
  if (daily && !daily.claimedToday && !shown && !dismissed) setShown(true);

  return { open: shown && !dismissed, daily, close: () => setDismissed(true) };
}
