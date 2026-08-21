'use client';

import { useTranslations } from 'next-intl';
import { Seg } from './Seg';
import { useLocaleControl, type Locale } from '@/shared/i18n';

const OPTIONS: { value: Locale; label: string }[] = [
  { value: 'ru', label: 'RU' },
  { value: 'en', label: 'EN' },
];

/** Переключатель языка интерфейса — тот же визуальный паттерн Seg, что у переключателя инструмента на странице «Рынок». */
export function LocaleSwitch() {
  const { locale, setLocale } = useLocaleControl();
  const t = useTranslations('common');
  return <Seg options={OPTIONS} value={locale} onChange={setLocale} ariaLabel={t('language')} />;
}
