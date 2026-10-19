'use client';

import { useState } from 'react';
import { createAttract, RaceCanvas } from '@/widgets/race-scene';

/**
 * Сцена гонок на витрине — не снимок и не отдельный рисунок, а та же сцена,
 * что в игре, в режиме показа: три бота едут по ночной трассе. 30 кадров в
 * секунду; вне экрана и у фоновой вкладки холст стоит (`RaceCanvas`).
 */
export function RaceScene() {
  const [src] = useState(createAttract);
  return (
    <div className="gscene rscene">
      <RaceCanvas source={src} fps={30} />
    </div>
  );
}
