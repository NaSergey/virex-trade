'use client';

import { useTranslations } from 'next-intl';
import { Seg } from './Seg';
import { useLocaleControl, type Locale } from '@/shared/i18n';

const OPTIONS: { value: Locale; label: string }[] = [
  { value: 'ru', label: 'RU' },
  { value: 'en', label: 'EN' },
];

/**
 * Переключатель языка интерфейса — тот же визуальный паттерн Seg, что у
 * переключателя инструмента на странице «Рынок».
 *
 * `className` прокидывается в Seg, чтобы место применения могло выбрать
 * готовый размер тумблера (`seg-tight` на обложке обучения, где он стоит в
 * строке заголовка), а не переопределять отступы кнопок снаружи.
 */
export function LocaleSwitch({ className }: { className?: string }) {
  const { locale, setLocale } = useLocaleControl();
  const t = useTranslations('common');
  return (
    <Seg
      className={className}
      options={OPTIONS}
      value={locale}
      onChange={setLocale}
      ariaLabel={t('language')}
    />
  );
}
