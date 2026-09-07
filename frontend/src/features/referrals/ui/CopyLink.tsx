'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';

/**
 * Ссылка с кнопкой «скопировать» рядом, а не только через буфер обмена:
 * `navigator.clipboard` есть не везде (старый браузер, страница не по HTTPS),
 * и тогда кнопка честно говорит, что не вышло, а ссылку всё равно можно
 * выделить мышью — она тут же, текстом. Тот же приём, что у реквизитов
 * доната (`features/donation/ui/CopyValue.tsx`), но свой маленький компонент:
 * фичи в проекте не тянут друг у друга внутренности ради одного места.
 */
export function CopyLink({ value }: { value: string }) {
  const t = useTranslations('referrals');
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState('done');
    } catch {
      setState('failed');
    }
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 'var(--s2)',
        justifyContent: 'flex-end',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{value}</span>
      <Button variant="bare" onClick={copy} aria-label={t('linkLabel')}>
        {state === 'done' ? t('copied') : state === 'failed' ? t('copyFailed') : t('copy')}
      </Button>
    </span>
  );
}
