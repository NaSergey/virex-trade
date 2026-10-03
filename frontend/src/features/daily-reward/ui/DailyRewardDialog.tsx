'use client';

import { Check, Flame } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useClaimDaily, type DailyState } from '@/entities/battle-pass';
import { cn } from '@/shared/lib/utils/css';
import { Button } from '@/shared/ui/Button';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, useDialogFade } from '@/shared/ui/dialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { RewardBurst } from '@/shared/ui/RewardBurst';
import { RewardItem, rewardItemOf } from '@/shared/ui/RewardItem';

/**
 * Окно ежедневной награды — одно на два входа: всплывает само при первом
 * заходе за день (`DailyRewardPrompt`) и открывается кнопкой в шапке профиля.
 *
 * Игровое окно (`tone="game"`) в янтаре и оранжевом: это раздача монет, и
 * окно о ней обязано выглядеть праздником. Сверху — сцена сегодняшней
 * награды: предмет на подставке, за ним вращаются лучи. Ниже — неделя
 * предметами, растущими день ото дня (монета → стопка → горка → сундук на
 * седьмой): плоские карточки с числом были скучны (владелец 2026-10-01).
 *
 * Выдача окно не закрывает — у сундука открывается крышка, монеты
 * разлетаются, день получает штамп, и только потом человек уходит «Готово».
 */
export function DailyRewardDialog({ daily, onClose }: { daily: DailyState; onClose: () => void }) {
  const t = useTranslations('profile');
  const claim = useClaimDaily();
  const { closing, close } = useDialogFade(onClose);
  // Между ответом сервера и перечиткой Battle Pass `claimedToday` ещё ложь —
  // без успеха мутации кнопка на этот миг снова звала бы «Забрать».
  const claimed = daily.claimedToday || claim.isSuccess;
  const max = Math.max(...daily.week);
  const todayItem = rewardItemOf(daily.coins, max);

  return (
    <Dialog open={!closing} onOpenChange={(v) => !v && close()}>
      <DialogContent tone="game" className="dlg-reward dlg-daily">
        <DialogHeader
          title={t('daily')}
          subtitle={t('dailyLede')}
          // Ноль дней подряд — это «ещё ни разу», а не серия: показывать тут
          // нечего, пока она не началась.
          aside={
            daily.streak > 0 ? (
              <span className="rw-streak">
                <Flame aria-hidden size={14} />
                {t('dailyStreak', { days: daily.streak })}
              </span>
            ) : undefined
          }
        />
        <DialogBody>
          {/* `is-fresh` — выдача случилась в этом окне: предмет подпрыгивает.
              Открывший окно после забора видит открытый сундук без прыжка. */}
          <div className={cn('rw-stage', claimed && 'is-claimed', claim.isSuccess && 'is-fresh')}>
            <span className="rw-rays" aria-hidden />
            <span className="rw-stage-glow" aria-hidden />
            <div className="rw-stage-item">
              <RewardItem kind={todayItem} open={claimed} />
              {claim.isSuccess && <RewardBurst coins={daily.coins} />}
            </div>
            <span className="rw-stage-sum n">
              +{daily.coins} <CoinIcon />
            </span>
            <span className="rw-stage-day">{t('day', { day: daily.day })}</span>
          </div>

          <ol className="rw-week">
            {daily.week.map((coins, i) => {
              const day = i + 1;
              const today = day === daily.day;
              const done = day < daily.day || (today && claimed);
              return (
                <li
                  key={day}
                  className={cn(
                    'rw-day',
                    done && 'is-done',
                    today && 'is-today',
                    day === daily.week.length && 'is-last',
                  )}
                >
                  <span className="rw-day-n">{t('day', { day })}</span>
                  <RewardItem kind={rewardItemOf(coins, max)} open={done && day === daily.week.length} />
                  <span className="rw-day-c n">+{coins}</span>
                  {done && (
                    <span
                      className={cn('rw-stamp', today && claim.isSuccess && 'is-fresh')}
                      aria-label={t('claimed')}
                    >
                      <Check size={14} strokeWidth={3.5} />
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="rw-note">
            {claimed ? t('dailyTomorrow', { coins: daily.nextCoins }) : t('dailyHint')}
          </p>
        </DialogBody>
        <DialogFooter className="df-solo">
          {claimed ? (
            <Button variant="solid" onClick={close}>
              {t('done')}
            </Button>
          ) : (
            <Button variant="solid" className="rw-claim" disabled={claim.isPending} onClick={() => claim.mutate()}>
              {t('claimPlus', { coins: daily.coins })}
              <CoinIcon />
            </Button>
          )}
        </DialogFooter>
        <ErrorNote error={claim.error} fallback={t('claimFailed')} />
      </DialogContent>
    </Dialog>
  );
}
