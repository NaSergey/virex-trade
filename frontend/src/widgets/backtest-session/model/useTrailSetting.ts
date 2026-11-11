'use client';

import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';

const STORAGE_KEY = 'virex.terminal.trail';

/**
 * Галочка «Подводящий» панели ордера — одна на «Маркет», «Лимит» и «Сетку»,
 * рабочая настройка тикета, как плечо (`useDefaultLeverage`): переживает
 * перезагрузку и новую сессию. По умолчанию выключена.
 */
export function useTrailSetting() {
  return usePersistentValue(STORAGE_KEY, (raw) => raw === '1', false, (v) => (v ? '1' : '0'));
}
