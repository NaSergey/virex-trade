'use client';

import { useSyncExternalStore } from 'react';

const noop = () => () => undefined;
const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Пояс устройства — только в браузере: на сервере его нет, и разметка разошлась бы (null). */
export const useDeviceTz = (): string | null => useSyncExternalStore(noop, deviceTz, () => null);
