import type { SVGProps } from 'react';

/** Пять свечей мотивом логотипа: контуры на сетке 100 × 100, сплошная заливка. */
const CANDLES = [
  // LEFT
  'M25 30 H27 V43 L29 45 V56 L27 58 V70 H25 V58 L23 56 V45 L25 43 Z',
  // LEFT CENTER
  'M38 18 H40 V35 L42 37 V63 L40 65 V82 H38 V65 L36 63 V37 L38 35 Z',
  // CENTER
  'M49 8 H51 V28 L53 30 V70 L51 72 V92 H49 V72 L47 70 V30 L49 28 Z',
  // RIGHT CENTER
  'M60 18 H62 V35 L64 37 V63 L62 65 V82 H60 V65 L58 63 V37 L60 35 Z',
  // RIGHT
  'M73 30 H75 V43 L77 45 V56 L75 58 V70 H73 V58 L71 56 V45 L73 43 Z',
];

/**
 * Логотип.
 *
 * Ни градиента, ни фильтров: сплошная заливка на целых координатах остаётся
 * чистой и в иконке 30–40 пикселей, и на весь экран — ровно то, обо что
 * разбивались варианты со свечением. Заливка идёт цветом извне (по умолчанию
 * белым, см. `.virex-logo` в globals.css), поэтому знак живёт в обеих темах.
 *
 * Разметкой, а не файлом из `public/`: знак едет вместе с компонентом — его
 * не потерять при переносе, не заблокировать гейтом сессии и не забыть
 * положить в образ. Своих `id` здесь больше нет, поэтому два лого на одной
 * странице (шапка и обложка тура) друг другу не мешают.
 */
export function VirexLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="geometricPrecision"
      className={['virex-logo', className].filter(Boolean).join(' ')}
      aria-label="Virex"
      {...props}
    >
      <g fill="#fff">
        {CANDLES.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}
