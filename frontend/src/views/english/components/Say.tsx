'use client';

import { Volume2 } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { speak } from '../model/speech';

/** Кнопка «произнести» рядом с английским текстом. */
export function Say({ text, slow }: { text: string; slow?: boolean }) {
  return (
    <Button
      variant="bare"
      tight
      className="en-say"
      title={slow ? 'Произнести медленно' : 'Произнести'}
      aria-label={slow ? 'Произнести медленно' : 'Произнести'}
      onClick={(e) => {
        e.stopPropagation();
        speak(text, slow);
      }}
    >
      <Volume2 size={14} aria-hidden />
      {slow ? <span className="en-say-slow">медленно</span> : null}
    </Button>
  );
}
