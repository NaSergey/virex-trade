'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { KeyValue } from '@/shared/ui/Lookup';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/shared/ui/dialog';
import { useReferralStats } from '../api/hooks';
import { CopyLink } from './CopyLink';

/**
 * «Пригласить друга» — постоянная персональная ссылка, без второго шага, в
 * отличие от доната: тут нечего ждать в реальном времени. Ссылка строится на
 * фронте из своего userId (уже есть в `/auth/me`) — отдельный «код» бэкенду
 * создавать незачем, см. дизайн.
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

  const link =
    open && typeof window !== 'undefined'
      ? `${window.location.origin}/login?mode=register&ref=${userId}`
      : '';

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
