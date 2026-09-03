'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';

/**
 * Значение, которое человек обязан перенести в кошелёк без единой опечатки:
 * адрес и сумма. Набирать их руками нельзя предлагать — ошибка в адресе
 * означает деньги, ушедшие в никуда, а ошибка в сумме — платёж, который не
 * опознается и уедет в ручную сверку.
 *
 * Поэтому значение всегда стоит рядом с кнопкой «скопировать», а не просто
 * показывается. `navigator.clipboard` есть не везде (старый браузер, страница
 * не по HTTPS) — тогда кнопка честно говорит, что не вышло, и значение всё
 * равно можно выделить мышью: оно тут же, текстом.
 */
export function CopyValue({ value, label }: { value: string; label?: string }) {
  const t = useTranslations('support');
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
    <span className="don-copy">
      <span className="don-copy-v">{value}</span>
      <Button variant="bare" onClick={copy} aria-label={label}>
        {state === 'done' ? t('copied') : state === 'failed' ? t('copyFailed') : t('copy')}
      </Button>
    </span>
  );
}
