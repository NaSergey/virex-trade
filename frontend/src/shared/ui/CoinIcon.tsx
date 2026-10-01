'use client';

import type { SVGProps } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Две грани «V» знака монеты, снятые по углам с исходника (растр 1378 × 1141)
 * и сведённые к ширине 100. Левая — широкая планка, правая — клин за ней.
 */
const LEFT = 'M0 10.8 29.2 10.5 55.5 56 42.1 73.6Z';
const RIGHT = 'M48.5 38.1 64.5 15.2 100 0 56.5 55.2Z';

/**
 * Монета — знаком вместо слова «монет» рядом с числом.
 *
 * Сплошная заливка цветом текста, без серебряного градиента исходника: в
 * строке знак стоит размером с букву, и перелив там сливался бы в пятно.
 * Свечение — лёгкое, фильтром в CSS (`.coin`, `--coin-glow`), и только на
 * тёмном поле. Грань клина чуть приглушена — она и отличает знак от галочки.
 * Цвет берётся из `color`, поэтому знак живёт в обеих темах.
 *
 * Для скринридера знак — слово «монет» (`role="img"`), то есть «100 монет»
 * читается так же, как читалось текстом. Своих `id` нет — знаков на странице
 * бывает десятки.
 */
export function CoinIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  const t = useTranslations('coins');
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 74"
      className={['coin', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={t('unit')}
      {...props}
    >
      <path d={LEFT} fill="currentColor" />
      <path d={RIGHT} fill="currentColor" fillOpacity={0.82} />
    </svg>
  );
}
