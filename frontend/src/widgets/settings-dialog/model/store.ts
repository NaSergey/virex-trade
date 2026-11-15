'use client';

import { useSyncExternalStore } from 'react';

/** Вкладки окна настроек — в порядке строки вкладок. */
export const SETTINGS_TABS = ['profile', 'exchange', 'notifications'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/**
 * Какое окно настроек открыто и на какой вкладке; `null` — закрыто.
 *
 * Окно одно на всё приложение (`SettingsHost` в `AppChrome`), а открывают его
 * из разных мест: меню профиля, шестерёнка своего профиля, терминал без ключа,
 * старый адрес `/settings`. Поэтому состояние — не `useState` у каждого, кто
 * открывает, а одно хранилище: второй экземпляр окна поверх первого был бы
 * вторым набором запросов и вторым черновиком пароля.
 */
let current: SettingsTab | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Открыть окно на вкладке (уже открытое просто переключает вкладку). */
export function openSettings(tab: SettingsTab = 'profile') {
  if (current === tab) return;
  current = tab;
  emit();
}

export function closeSettings() {
  if (current === null) return;
  current = null;
  emit();
}

export function useSettingsTab(): SettingsTab | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
