'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import type { JetpackView } from '@/entities/jetpack';
import { flightAt, formatX, hullCenter, mAt, shipSize, thrustAt, x100At } from '../lib/flight';
import { useFrames } from '../model/useFrames';
import { Ship, ShipDefs } from './Ship';
import { FrontClouds, World, type WorldHandle } from './World';

/** Размер поля — ResizeObserver: мир и ракета раскладываются в его пикселях. */
function useBoxSize(ref: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/**
 * Поле полёта — от земли до космоса. В окне ставок ракета стоит на площадке
 * вертикально и идёт отсчёт. На взлёте с площадки валит дым, ракета по дуге
 * гравитационного разворота уходит вправо-вверх до своей точки кадра; дальше
 * камера ведёт её по курсу, а мир уходит вниз-влево: город и горы, облака
 * закатного неба, потом звёзды, туманность и планета. Метки множителя
 * проезжают мимо сопла ровно тогда, когда на табло их число.
 *
 * Кадр пишется в DOM каждым `requestAnimationFrame` — только
 * `transform`/`opacity` слоёв (`World`, `Ship`). На краше мир замирает,
 * ракета исчезает во вспышке, число краснеет.
 */
export function FlightStage({ view }: { view: JetpackView }) {
  const t = useTranslations('jetpack');
  const box = useRef<HTMLDivElement>(null);
  const ship = useRef<HTMLDivElement>(null);
  const world = useRef<WorldHandle>(null);
  const front = useRef<WorldHandle>(null);
  const num = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const { w, h } = useBoxSize(box);
  const size = shipSize(h);
  // Точка взрыва — чистым расчётом в рендере, а не состоянием из эффекта.
  const crashM = view.phase === 'crashed' && view.crashX100 !== null ? view.crashX100 / 100 : null;
  const crashAt = crashM !== null && w && h ? flightAt(crashM, w, h) : null;
  const burst = crashAt ? hullCenter(crashAt.x, crashAt.y, size.hull, crashAt.deg) : null;
  // Дым старта — у раунда, который взлетел; новый раунд его не наследует.
  const launched = view.phase === 'flying' || view.phase === 'crashed' ? view.roundId : null;

  const place = (m: number) => {
    if (!w || !h) return;
    const f = flightAt(m, w, h);
    if (ship.current) ship.current.style.transform = `translate(${f.x}px, ${f.y}px) rotate(${f.deg}deg)`;
    world.current?.place(f);
    front.current?.place(f);
  };

  /** Тяга двигателя — переменной на корабле: от неё длина факела, форсаж, ореол. */
  const thrust = (v: number) => ship.current?.style.setProperty('--thrust', v.toFixed(3));

  const frame = () => {
    const now = Date.now() + view.offset;
    if (view.phase === 'flying' && view.launchedAt !== null) {
      const ms = now - view.launchedAt;
      place(mAt(ms, view.rate));
      thrust(thrustAt(ms));
      if (num.current) num.current.textContent = formatX(x100At(ms, view.rate));
    } else if (view.phase === 'betting' && view.launchAt !== null) {
      const left = Math.max(0, view.launchAt - now);
      if (num.current) num.current.textContent = (left / 1000).toFixed(1);
      if (bar.current) bar.current.style.transform = `scaleX(${left / view.betMs})`;
    }
  };

  useFrames(view.phase === 'flying' || view.phase === 'betting', frame);

  // Неподвижные кадры: площадка в окне ставок и место взрыва после краша.
  useLayoutEffect(() => {
    if (crashM !== null) {
      place(crashM);
      if (num.current) num.current.textContent = formatX(view.crashX100!);
    } else if (view.phase === 'betting' || view.phase === 'idle') {
      place(1);
      thrust(0);
      // Число краша не должно простоять кадр под «Взлёт через»: отсчёт — сразу.
      if (view.phase === 'betting') frame();
      else if (num.current) num.current.textContent = '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- кадр зависит от фазы и размера, не от функций рендера
  }, [view.phase, crashM, view.roundId, w, h]);

  const label =
    view.phase === 'betting'
      ? t('launchIn')
      : view.phase === 'crashed'
        ? t('crashed')
        : view.phase === 'idle'
          ? t('waiting')
          : '';

  return (
    <div ref={box} className="jpg-stage" data-phase={view.phase}>
      <ShipDefs />
      <World ref={world} w={w} h={h} hull={size.hull} launched={launched} />
      <Ship
        ref={ship}
        w={size.w}
        h={size.h}
        hidden={view.phase === 'crashed' || !w}
        flying={view.phase === 'flying'}
      />
      <FrontClouds ref={front} w={w} h={h} hull={size.hull} />
      {burst && <i className="jpg-burst" style={{ left: burst.x, top: burst.y }} />}
      <div className="jpg-readout">
        <span className="jpg-label">{label}</span>
        <span ref={num} className="jpg-num n" />
        {view.phase === 'betting' && (
          <span className="jpg-bar" aria-hidden>
            <span ref={bar} />
          </span>
        )}
      </div>
    </div>
  );
}
