'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useClaimDaily, type DailyState } from '@/entities/battle-pass';
import { cn } from '@/shared/lib/utils/css';
import { Button } from '@/shared/ui/Button';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, useDialogFade } from '@/shared/ui/dialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';

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

  return (
    <Dialog open={!closing} onOpenChange={(v) => !v && close()}>
      <DialogContent tone="game" className="dlg-reward dlg-daily">
        {/* Счётчика «N дн. подряд» в шапке нет — снят владельцем 2026-10-04. */}
        <DialogHeader title={t('daily')} />
        <DialogBody>
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
                  <span className="rw-day-c n">
                    {done ? <Check aria-label={t('claimed')} size={16} strokeWidth={3.5} /> : `+${coins}`}
                  </span>
                </li>
              );
            })}
          </ol>
        </DialogBody>
        <DialogFooter className="df-solo">
          {claimed ? (
            <Button variant="solid" onClick={close}>
              {t('done')}
            </Button>
          ) : (
            // Забрать и закрыть одним нажатием: монеты видны на балансе, второй
            // кнопки «Готово» после выдачи не нужно.
            <Button
              variant="solid"
              className="rw-claim"
              disabled={claim.isPending}
              onClick={() => claim.mutate(undefined, { onSuccess: close })}
            >
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
