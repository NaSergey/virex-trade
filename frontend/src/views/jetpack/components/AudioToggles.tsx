'use client';

import { AudioControl } from '@/shared/ui/AudioControl';
import { useJetpackMusic, useJetpackSfx } from '../model/useJetpackSound';

/**
 * Звук и музыка — справа в верхней панели. Сами кнопки общие для игр
 * (`AudioControl`); своё у джетпака — только каналы.
 */
export function AudioToggles() {
  return (
    <div className="jpg-audio-set">
      <AudioControl kind="sound" channel={useJetpackSfx()} />
      <AudioControl kind="music" channel={useJetpackMusic()} />
    </div>
  );
}
