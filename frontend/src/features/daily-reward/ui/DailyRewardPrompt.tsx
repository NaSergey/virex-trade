'use client';

import { useTranslations } from 'next-intl';
import { DailyWeekRow } from '@/entities/battle-pass';
import { Button } from '@/shared/ui/Button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, useDialogFade } from '@/shared/ui/dialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { useDailyRewardPrompt } from '../model/useDailyRewardPrompt';

/**
 * Приглашение забрать ежедневную награду — всплывает само при первом заходе
 * за день, если она ещё не забрана. То же окно, что карточка на /profile
 * (общий `DailyWeekRow`), но не требует туда идти: индикатор в шапке остаётся
 * для тех, кто это окно закрыл, не забрав.
 */
export function DailyRewardPrompt() {
  const { open, daily, claim, close } = useDailyRewardPrompt();
  if (!open || !daily) return null;

  return <Prompt daily={daily} claim={claim} onClose={close} />;
}

function Prompt({
  daily,
  claim,
  onClose,
}: {
  daily: NonNullable<ReturnType<typeof useDailyRewardPrompt>['daily']>;
  claim: ReturnType<typeof useDailyRewardPrompt>['claim'];
  onClose: () => void;
}) {
  const t = useTranslations('profile');
  const { closing, close } = useDialogFade(onClose);

  return (
    <Dialog open={!closing} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader
          title={t('daily')}
          subtitle={t('dailyLede')}
          // Ноль дней подряд — это «ещё ни разу», а не серия: показывать тут
          // нечего, пока она не началась.
          aside={daily.streak > 0 ? <span className="muted">{t('dailyStreak', { days: daily.streak })}</span> : undefined}
        />
        <DialogBody>
          <DailyWeekRow daily={daily} />
        </DialogBody>
        <DialogFooter className="df-solo">
          <Button
            variant="solid"
            disabled={claim.isPending}
            onClick={() => claim.mutate(undefined, { onSuccess: close })}
          >
            {t('dailyClaim', { coins: daily.coins })}
          </Button>
        </DialogFooter>
        <ErrorNote error={claim.error} fallback={t('claimFailed')} />
      </DialogContent>
    </Dialog>
  );
}
