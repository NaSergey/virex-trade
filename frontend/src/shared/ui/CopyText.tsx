'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/utils/css';
import { Button } from './Button';

/**
 * Число в строке таблицы, которое копируется нажатием: цену и объём лимита
 * переносят на биржу или в TradingView, и набирать их руками — значит ошибиться
 * в знаке. Показывается `children` (с разделителями разрядов), а копируется
 * `value` — голое число, которое примет любое поле ввода.
 *
 * Отклик — галочка слева от числа, а не подпись «Скопировано» на его месте:
 * числа в колонке выровнены по правому краю, и замена текста сдвигала бы их.
 * Нажатие не всплывает к строке — как у символа монеты (`CoinSymbol`).
 */
export function CopyText({ value, children }: { value: string; children: ReactNode }) {
  const t = useTranslations('common');
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 1500);
    return () => clearTimeout(timer);
  }, [state]);

  const label = state === 'done' ? t('copied') : state === 'failed' ? t('copyFailed') : t('copy');
  return (
    <Button
      variant="none"
      className={cn('copy-val', state !== 'idle' && `copy-${state}`)}
      title={label}
      aria-label={`${label}: ${value}`}
      onClick={(e) => {
        e.stopPropagation();
        // `navigator.clipboard` есть не везде (страница не по HTTPS) — тогда крестик, а число можно выделить мышью.
        if (!navigator.clipboard) {
          setState('failed');
          return;
        }
        navigator.clipboard.writeText(value).then(
          () => setState('done'),
          () => setState('failed'),
        );
      }}
    >
      {children}
    </Button>
  );
}

/** Число для буфера: без разделителей разрядов, которые вставляет форматирование. */
export const plainNumber = (formatted: string) => formatted.replace(/[\s   ]/g, '').replace('−', '-');
