'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { useTheme } from '@/shared/theme';

/**
 * Иконки набраны штрихом в currentColor: в системе, где цвет означает только
 * деньги, у знака не может быть собственной окраски — он берёт краску листа.
 */
function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden="true">
      <circle cx="8" cy="8" r="3.1" />
      {/* Восемь лучей: четыре по осям, четыре по диагоналям — рисуются одной
          формулой, чтобы длина и отступ у всех были одинаковы на глаз. */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        const [dx, dy] = [Math.cos(a), Math.sin(a)];
        return (
          <line
            key={i}
            x1={(8 + dx * 5).toFixed(2)}
            y1={(8 + dy * 5).toFixed(2)}
            x2={(8 + dx * 6.7).toFixed(2)}
            y2={(8 + dy * 6.7).toFixed(2)}
          />
        );
      })}
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden="true">
      <path d="M13 9.9A5.6 5.6 0 0 1 6.1 3a5.7 5.7 0 1 0 6.9 6.9z" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Переключатель темы. Не `Seg` с двумя вариантами, как у языка: тем ровно две,
 * и в шапке за них отвечает одна кнопка — знак показывает, куда переключит, а
 * не где ты сейчас. Подпись для скринридера говорит то же самое действием.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const t = useTranslations('common');
  const label = theme === 'dark' ? t('themeLight') : t('themeDark');

  return (
    <Button variant="none" className="acct ico" onClick={toggleTheme} title={label} aria-label={label}>
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}
