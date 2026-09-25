'use client';

import type { AnimationEvent, CSSProperties } from 'react';
import { betPoint, type SeatPoint } from '../lib/layout';
import { CENTER, COLLECT, DEALER, offsetFrom, WIN_FLY } from '../lib/motion';
import { ChipStack } from './ChipStack';
import { CardBack } from './PlayingCard';

/**
 * Точка стола, а не пиксели: место игрока, его ставка на пути к центру,
 * центр сукна, колода крупье. Игра говорит, откуда и куда едет предмет, а где
 * эта точка на сцене — решает раскладка в момент отрисовки: сцена меняет
 * пропорцию, и координаты, посчитанные заранее, уехали бы.
 *
 * `{ at }` — точка, снятая с экрана в момент броска (кнопка фишки под столом,
 * `stagePointOf`): она живёт одну анимацию, и уехать за это время не успевает.
 */
export type Anchor = { seat: number } | { bet: number } | { at: SeatPoint } | 'center' | 'dealer';

/**
 * Где на сцене стоит элемент вне её — в процентах сцены, как места; под
 * столом это больше 100. Нужна, чтобы фишка полетела на стол от кнопки, по
 * которой нажали.
 */
export function stagePointOf(el: Element): SeatPoint | null {
  const stage = el.closest('.ct-page')?.querySelector('.ct-stage');
  if (!stage) return null;
  const s = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (!s.width || !s.height) return null;
  return {
    x: ((r.left + r.width / 2 - s.left) / s.width) * 100,
    y: ((r.top + r.height / 2 - s.top) / s.height) * 100,
  };
}

/**
 * Предмет, которого на столе уже нет, но который должен доехать: ставка в
 * банк или крупье, сброшенные карты в колоду, выигрыш к месту.
 */
export interface Ghost {
  id: number;
  what: 'chips' | 'cards';
  from: Anchor;
  to: Anchor;
  delay: number;
  amount?: number;
  /** Длительность полёта; по умолчанию — сбор ставок (`COLLECT`). */
  ms?: number;
}

/**
 * Слой доезжающих предметов. Каждый живёт ровно одну анимацию и снимается по
 * её концу.
 *
 * `betOf` — где у игры лежит ставка места: у покера на сукне по пути к центру
 * (`betPoint`, по умолчанию), у блэкджека — прямо перед игроком, над плашкой.
 */
export function Effects({
  ghosts,
  pointOf,
  betOf,
  onDone,
}: {
  ghosts: Ghost[];
  pointOf: (seatIndex: number) => SeatPoint;
  betOf?: (seatIndex: number) => SeatPoint;
  onDone: (id: number) => void;
}) {
  const resolve = (a: Anchor): SeatPoint =>
    a === 'center'
      ? CENTER
      : a === 'dealer'
        ? DEALER
        : 'seat' in a
          ? pointOf(a.seat)
          : 'bet' in a
            ? (betOf?.(a.bet) ?? betPoint(pointOf(a.bet)))
            : a.at;

  return (
    <div className="ct-effects" aria-hidden>
      {ghosts.map((g) => {
        const from = resolve(g.from);
        const go = offsetFrom(resolve(g.to), from);
        const ms = g.ms ?? COLLECT;
        const style = {
          left: `${from.x}%`,
          top: `${from.y}%`,
          '--dx': go.dx,
          '--dy': go.dy,
          '--go-ms': `${ms}ms`,
          animationDelay: `${g.delay}ms`,
        } as CSSProperties;
        const end = (e: AnimationEvent) => {
          if (e.target === e.currentTarget) onDone(g.id);
        };
        return g.what === 'cards' ? (
          <span key={g.id} className="ct-ghost ct-muck" style={style} onAnimationEnd={end}>
            <CardBack size="sm" />
            <CardBack size="sm" />
          </span>
        ) : (
          <span key={g.id} className="ct-ghost ct-g-chips" style={style} onAnimationEnd={end}>
            <ChipStack amount={g.amount ?? 1} width={ms >= WIN_FLY ? 30 : 22} />
          </span>
        );
      })}
    </div>
  );
}
