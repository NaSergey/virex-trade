'use client';

import { Button } from '@/shared/ui/Button';
import { useSaveSettings, type PlanState } from '../api/hooks';
import { useDeviceTz } from '../model/useDeviceTz';

/**
 * Две вещи, без которых план молча не работает: бот не привязан — напоминаний
 * нет; пояс плана не тот, что у устройства, — напоминания приходят не в то
 * время. Пояс сам не меняется: телефон в поездке не должен двигать весь план.
 */
export function Notices({ state }: { state: PlanState }) {
  const save = useSaveSettings();
  const device = useDeviceTz();

  return (
    <>
      {!state.telegram && (
        <p className="pl-notice">
          Telegram не привязан — напоминаний не будет. Привяжите бота на основном сайте: «Настройки» → Telegram.
        </p>
      )}
      {device && device !== state.settings.tz && (
        <p className="pl-notice">
          План идёт по поясу {state.settings.tz}, а устройство — {device}.{' '}
          <Button variant="bare" tight disabled={save.isPending} onClick={() => save.mutate({ ...state.settings, tz: device })}>
            Перевести план на {device}
          </Button>
        </p>
      )}
    </>
  );
}
