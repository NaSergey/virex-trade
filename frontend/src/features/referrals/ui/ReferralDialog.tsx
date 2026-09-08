'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, Input } from '@/shared/ui/Field';
import { KeyValue } from '@/shared/ui/Lookup';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/shared/ui/dialog';
import { useDebouncedValue } from '@/shared/lib/hooks/useDebouncedValue';
import { useReferralStats, useSetReferralSlug, useSlugAvailable } from '../api/hooks';
import { CopyLink } from './CopyLink';

/** Латиница, цифры, дефис — то же ограничение, что проверяет бэкенд. */
const SLUG_FORMAT = /^[a-z0-9-]{3,30}$/;

/**
 * «Пригласить друга» — постоянная персональная ссылка, без второго шага, в
 * отличие от доната: тут нечего ждать в реальном времени, кроме живой
 * проверки доступности слага. Ссылка строится на фронте из своего userId
 * или, если задан, из кастомного слага — отдельный «код» бэкенду создавать
 * незачем, см. дизайн.
 */
export function ReferralDialog({
  userId,
  open,
  onClose,
}: {
  userId: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('referrals');
  const tc = useTranslations('common');
  const { data: stats } = useReferralStats();
  const setSlug = useSetReferralSlug();

  const [slugInput, setSlugInput] = useState('');
  // Черновик подтягивается из сохранённого слага при каждом ОТКРЫТИИ окна, а
  // не на каждое обновление stats: иначе фоновый рефетч (например, при
  // возврате на вкладку) стирал бы то, что человек ещё не сохранил.
  useEffect(() => {
    if (open) setSlugInput(stats?.slug ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- см. комментарий выше: подтягиваем только на open
  }, [open]);

  const debouncedSlug = useDebouncedValue(slugInput, 300);
  const normalized = debouncedSlug.trim().toLowerCase();
  const formatValid = SLUG_FORMAT.test(normalized);
  const isUnchanged = normalized === (stats?.slug ?? '');
  const checkEnabled = open && formatValid && !isUnchanged;

  const { data: availability, isFetching: checking } = useSlugAvailable(normalized, checkEnabled);
  const canSave = checkEnabled && availability?.available === true && !setSlug.isPending;

  const link =
    open && typeof window !== 'undefined'
      ? `${window.location.origin}/login?mode=register&ref=${stats?.slug ?? userId}`
      : '';

  // Единая точка, откуда берутся и текст статуса, и его цвет — раньше это были
  // бы два параллельных выражения, и рассинхронить их легко: например,
  // показать «проверяю…» зелёным цветом «свободно».
  const status = (() => {
    if (normalized === '') return null;
    if (!formatValid) return { text: t('formatHint'), cls: 'muted' };
    if (isUnchanged) return null;
    if (checking) return { text: t('checking'), cls: 'muted' };
    if (availability?.available) return { text: t('available'), cls: 'pos' };
    if (availability?.available === false) return { text: t('taken'), cls: 'neg' };
    return null;
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader title={t('title')} subtitle={t('lede')} />
        <DialogBody>
          <KeyValue label={t('linkLabel')}>
            <CopyLink value={link} />
          </KeyValue>
          <KeyValue label={t('totalLabel')}>{stats?.total ?? '—'}</KeyValue>
          <KeyValue label={t('withKeyLabel')}>{stats?.withKey ?? '—'}</KeyValue>

          <Field label={t('customLabel')} htmlFor="referral-slug">
            <span style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center' }}>
              <Input
                id="referral-slug"
                placeholder={t('slugPlaceholder')}
                maxLength={30}
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value)}
              />
              <Button variant="bare" disabled={!canSave} onClick={() => setSlug.mutate(normalized)}>
                {setSlug.isPending ? tc('saving') : tc('save')}
              </Button>
            </span>
          </Field>
          {status && (
            <p className={status.cls} style={{ marginTop: 'var(--s1)' }}>
              {status.text}
            </p>
          )}
          <ErrorNote error={setSlug.error} fallback={t('slugSaveFailed')} style={{ marginTop: 'var(--s1)' }} />
        </DialogBody>
        <DialogFooter>
          <Button variant="solid" onClick={onClose}>
            {tc('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
