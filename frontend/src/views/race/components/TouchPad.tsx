'use client';

import type { PointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import type { Pad, PadKey } from '../model/pad';

/** Сенсорный руль: держишь кнопку — нажато. Видны только на сенсорных экранах (CSS). */
export function TouchPad({ pad }: { pad: Pad }) {
  const t = useTranslations('race');
  const bind = (k: PadKey) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      pad.set(k, true);
    },
    onPointerUp: () => pad.set(k, false),
    onPointerCancel: () => pad.set(k, false),
    onLostPointerCapture: () => pad.set(k, false),
  });
  return (
    <div className="rc-touch">
      <Button variant="none" aria-label={t('touch.left')} {...bind('left')}>
        ←
      </Button>
      <Button variant="none" className="rc-touch-brake" {...bind('brake')}>
        {t('touch.brake')}
      </Button>
      <Button variant="none" aria-label={t('touch.right')} {...bind('right')}>
        →
      </Button>
    </div>
  );
}
