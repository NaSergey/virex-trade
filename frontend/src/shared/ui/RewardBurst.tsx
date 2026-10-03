'use client';

import type { CSSProperties } from 'react';

/** Сколько искр и монет разлетается из карточки награды. */
const SPARKS = 12;
const COINS = 8;

/**
 * Разлёт искр, монет и «+N», поднимающееся над карточкой награды, — у окон
 * ежедневной награды и наград сезона. Рисуется только у выдачи, случившейся в
 * открытом окне: открывший окно после забора видит отмеченную карточку без
 * салюта.
 *
 * Монеты взлетают дугой и падают (`--dx` — куда), искры — лучами. Одноразовая
 * анимация с `forwards`, последний кадр пустой — под reduced-motion глобальное
 * правило сразу ставит именно его. Родитель — `position: relative`
 * (карточка), слой стоит по её центру. `delay` — сдвиг всего салюта в мс:
 * карточки сезона взрываются по очереди.
 */
export function RewardBurst({ coins, delay = 0 }: { coins: number; delay?: number }) {
  return (
    <span className="rw-burst" style={{ '--bd': `${delay}ms` } as CSSProperties} aria-hidden>
      {Array.from({ length: SPARKS }, (_, i) => (
        <i key={i} style={{ '--i': i } as CSSProperties} />
      ))}
      {Array.from({ length: COINS }, (_, i) => (
        <s key={i} style={{ '--i': i, '--dx': `${(i - (COINS - 1) / 2) * 16}px` } as CSSProperties} />
      ))}
      <b className="n">+{coins}</b>
    </span>
  );
}
