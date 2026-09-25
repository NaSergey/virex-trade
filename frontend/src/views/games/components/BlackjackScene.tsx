'use client';

import { useRef } from 'react';
import {
  CasinoStage,
  Cards,
  Chips,
  Embers,
  Reflection,
  Shadows,
  type CardSpec,
  type ChipSpec,
  type Ember,
} from './CasinoScene';
import { Art, Fill } from './SceneLayer';
import { FULL } from '../lib/scene-box';
import { usePauseOffscreen } from '../model/usePauseOffscreen';
import { usePlayOnHover } from '../model/usePlayOnHover';

/**
 * Сцена блэкджека — из тех же деталей, что и покер (`CasinoScene.tsx`), но
 * узнаваться она обязана без названия, а общие карты и фишки сами по себе
 * говорят только «казино». Поэтому отличия — в том, что в кадре, а не в
 * отделке:
 * - рука — туз и валет, натуральный блэкджек, а не карманная пара;
 * - сумма руки, «21», напечатана на свободной фишке — это первое, по чему
 *   игру узнают. Раньше она висела значком над рукой; на фишке она часть
 *   предмета, а не надпись поверх кадра;
 * - зелёный свет сцены (акцент игры в каталоге), две стоящие фишки, дым
 *   вместо разрядов;
 * - в покое карты парят порознь, а валет время от времени переворачивается
 *   рубашкой и обратно — жест крупье (`.csn-flip`); у покера на его месте
 *   пара тузов, которая раскрывается и сходится одной рукой.
 *
 * Под курсором валет переворачивается сразу — тот же жест, что в покое, без
 * ожидания цикла (`[data-play]` в globals.css). Фишка с «21» под курсором не
 * вспыхивает: нижнюю половину кадра тогда закрывает `.gcard-reveal`, и
 * вспышку там никто бы не увидел. Карты стоят на местах: раздача с прилётом
 * из шуза здесь была и снята — карты пропадали из кадра. У покера под
 * курсором вскрытие, и две карточки не отвечают одним жестом.
 */

const P = 'bj';

const FLOOR = 444;

/** Валет — дальний и мельче, туз — впереди, как на снимке, который сцена заменила. */
const CARDS: CardSpec[] = [
  {
    id: 'jack',
    rank: 'J',
    suit: 'c',
    tone: 'glow',
    x: 292,
    y: 240,
    rot: 8,
    w: 118,
    h: 168,
    motion: { dur: 6800, delay: 300, lift: 8, sway: 1.2, glow: 3500 },
    flip: true,
  },
  {
    id: 'ace',
    rank: 'A',
    suit: 's',
    tone: 'steel',
    x: 165,
    y: 259,
    rot: -8,
    w: 150,
    h: 212,
    motion: { dur: 6200, delay: 1100, lift: 10, sway: -1.2, glow: 3100 },
  },
];

/** Две стоящие фишки, лицом к зрителю: левая с трефой, правая с суммой руки. */
const CHIPS: ChipSpec[] = [
  { x: 270, y: 376, rot: -18, r: 58, k: 0.86, t: 16, stack: 1, label: '21', shade: 0.55, motion: { dur: 5400, delay: 1800, lift: 5, sway: -1.8, glow: 4300 } },
  { x: 116, y: 370, rot: 20, r: 66, k: 0.8, t: 16, stack: 1, mark: 'c', shade: 0.5, motion: { dur: 6000, delay: 700, lift: 6, sway: 2, glow: 3900 } },
];

const EMBERS: Ember[] = [
  [28, 446, 1.8, 8],
  [96, 468, 2.4, -6],
  [190, 456, 1.6, 10],
  [236, 470, 2.2, -8],
  [318, 452, 1.8, 6],
  [352, 420, 2.4, -10],
  [370, 466, 1.5, -4],
];

/** Дым у левого края и справа — плавные завитки, у покера на их месте разряды. */
const WISPS = [
  'M26 424 C6 384 40 352 22 314 S4 252 34 214',
  'M52 408 C34 376 66 346 48 306',
  'M360 408 C380 368 348 336 366 296',
];

export function BlackjackScene() {
  const ref = useRef<HTMLDivElement>(null);
  usePauseOffscreen(ref);
  // Жест под курсором доигрывает до конца: наведение ставит data-play,
  // снимает его конец переворота валета (csn-flip-once).
  usePlayOnHover(ref, 'csn-flip-once');
  return (
    <CasinoStage p={P} scene="bscene" floor={FLOOR} stageRef={ref}>
      <Fill className="csn-aura">
        <Art box={FULL}>
          <g filter={`url(#${P}-aura)`} fill="var(--csn-3)">
            <ellipse cx="220" cy="228" rx="150" ry="140" opacity="0.26" />
            <ellipse cx="80" cy="330" rx="42" ry="70" opacity="0.22" />
            <ellipse cx="190" cy={FLOOR + 8} rx="180" ry="24" opacity="0.45" />
          </g>
          <g stroke="var(--csn-4)" strokeLinecap="round">
            <g filter={`url(#${P}-soft)`} strokeWidth="4" opacity="0.5">
              {WISPS.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
            <g strokeWidth="1.1" opacity="0.6">
              {WISPS.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
          </g>
        </Art>
      </Fill>

      <Reflection chips={CHIPS} p={P} floor={FLOOR} />
      <Shadows chips={CHIPS} p={P} floor={FLOOR} />
      <Cards cards={CARDS} p={P} />
      <Chips chips={CHIPS} p={P} />
      <Embers embers={EMBERS} />
    </CasinoStage>
  );
}
