'use client';

import { useState } from 'react';

/**
 * Значки монет — открытый набор `cryptocurrency-icons` с jsDelivr: ~500 монет,
 * цветные SVG на круглой подложке. Версия зафиксирована: адрес не должен
 * поменять картинку сам.
 */
const ICONS = 'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color';

/**
 * Монеты, которых в наборе нет, — запоминаются на всю жизнь вкладки: иначе
 * каждый новый список заново спрашивал бы 404 за каждую из них.
 */
const missing = new Set<string>();

/** «1000PEPE» → «pepe»: у Bybit дробные монеты торгуются пачкой, значок — у самой монеты. */
const slugOf = (base: string) => base.replace(/^\d+/, '').toLowerCase();

/**
 * Круглый значок монеты. Нет в наборе или не загрузился — круг с первой
 * буквой: место под значок держится одинаковым, и строка не прыгает.
 * Круг нарисован SVG, а не скруглением: радиусы в продукте сброшены глобально.
 */
export function CoinLogo({ base, size = 20, placeholder = false }: { base: string; size?: number; placeholder?: boolean }) {
  const slug = slugOf(base);
  const [failed, setFailed] = useState(() => missing.has(slug));

  if (placeholder || failed || !slug)
    return (
      <svg className="coin-logo" width={size} height={size} viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r="10" className="coin-logo-bg" />
        <text x="10" y="10" dy="0.35em" textAnchor="middle" className="coin-logo-letter">
          {placeholder ? '' : (slug[0] ?? base[0] ?? '').toUpperCase()}
        </text>
      </svg>
    );

  return (
    // Не next/image: картинка внешняя и крошечная, оптимизатору тут нечего делать.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="coin-logo"
      src={`${ICONS}/${slug}.svg`}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      onError={() => {
        missing.add(slug);
        setFailed(true);
      }}
    />
  );
}
