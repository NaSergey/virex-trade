import type { CSSProperties, ReactNode } from 'react';
import { boxStyle, viewBoxOf, type Box } from '../lib/scene-box';

/**
 * Слои сцен витрины. Сцена — не один SVG, а стопка HTML-слоёв, у каждого свой
 * SVG в общих координатах кадра (384×514).
 *
 * Причина — цена кадра. Движение узла внутри SVG браузер не умеет отдать
 * видеокарте: он перерисовывает весь SVG на каждом кадре, и вместе с ним
 * заново считает каждое размытие — свечение карт, зарево, тени. Пятнадцать
 * размытий на кадр в двух сценах сразу и давали подлагивание. Движение
 * HTML-слоя (`transform`, `opacity`) идёт на видеокарте: SVG внутри слоя
 * рисуется один раз, а дальше слой только сдвигается и гаснет.
 *
 * Отсюда правило: всё, что движется, — отдельный слой, и внутри его SVG ничего
 * не анимируется. Рисунок в слое — в координатах сцены (`viewBox` = рамка
 * слоя), поэтому геометрия предметов та же, что у цельного SVG.
 */

/** SVG слоя: окно — рамка слоя, рисунок — в координатах сцены. */
export function Art({ box, children }: { box: Box; children: ReactNode }) {
  return (
    <svg className="gl-art" viewBox={viewBoxOf(box)} fill="none" aria-hidden>
      {children}
    </svg>
  );
}

/** Слой на месте рамки `box` — положение в процентах кадра. */
export function Place({
  box,
  className,
  style,
  children,
}: {
  box: Box;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className={className ? `gl ${className}` : 'gl'} style={{ ...boxStyle(box), ...style }}>
      {children}
    </div>
  );
}

/** Подслой во всю рамку родителя: под движение, прозрачность, переворот. */
export function Fill({ className, style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className={className ? `gl-fill ${className}` : 'gl-fill'} style={style}>
      {children}
    </div>
  );
}
