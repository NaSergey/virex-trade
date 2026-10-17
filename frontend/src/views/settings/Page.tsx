'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { openSettings } from '@/widgets/settings-dialog';

/**
 * Страницы настроек больше нет — настройки живут в одном окне с вкладками
 * (владелец 2026-10-17). Адрес остаётся ради старых ссылок и закладок:
 * открывает окно на вкладке «Биржа» (это и было на странице) и уводит на
 * главную — терминал, поверх которого окно и встаёт.
 */
export function SettingsPage() {
  const router = useRouter();
  useEffect(() => {
    openSettings('exchange');
    router.replace('/terminal');
  }, [router]);
  return null;
}
