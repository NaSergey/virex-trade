'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Туман противника — не рисунок, а фактура (спека, «Вид и звук»): зерно
 * рисуется один раз в canvas и кладётся фоном двух слоёв, дальше двигаются
 * только `transform` и `opacity`. Туман редеет вместе со здоровьем противника,
 * попадание сдвигает его (`hit` меняется — анимация заново).
 */
let texture: string | null = null;

function grain(): string {
  if (texture) return texture;
  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return '';
  const img = g.createImageData(size, size);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 200 + Math.floor(rnd() * 55);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v + 4;
    img.data[i + 3] = Math.floor(rnd() * rnd() * 150);
  }
  g.putImageData(img, 0, 0);
  texture = canvas.toDataURL('image/png');
  return texture;
}

export function Fog({ density, hit, children }: { density: number; hit: number; children: ReactNode }) {
  const layers = useRef<HTMLDivElement>(null);

  // Фон пишется в DOM после монтирования: на сервере canvas нет, и разметка
  // не должна расходиться с первой отрисовкой в браузере.
  // Переменной на родителе: слои пересоздаются на каждом попадании и наследуют её.
  useEffect(() => {
    layers.current?.style.setProperty('--eg-grain', `url(${grain()})`);
  }, []);

  return (
    <div className="eg-fog">
      <div ref={layers} className="eg-fog-layers" style={{ opacity: 0.15 + 0.85 * Math.max(0, Math.min(1, density)) }}>
        <div key={hit} className="eg-fog-shake">
          <div className="eg-fog-layer" />
          <div className="eg-fog-layer eg-fog-layer-2" />
        </div>
      </div>
      <div className="eg-fog-body">{children}</div>
    </div>
  );
}
