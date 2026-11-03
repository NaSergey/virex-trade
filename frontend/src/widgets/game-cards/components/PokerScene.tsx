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
 * Сцена покера — картинка карточки, нарисованная кодом. У торговли сцена
 * потому, что снимок рынка выдумал бы историю цены; здесь причина другая:
 * снимок не двигается. Эффекты поверх `poker.webp` (свет, искры) оставили бы
 * карты и фишки на месте, а двигаться должны именно они — поэтому предметы
 * собраны заново, каждый отдельным слоем (детали — `CasinoScene.tsx`).
 *
 * Композиция та же, что у снимка: две чёрные карты с красным неоном по
 * кромке — A♠ сзади слева, A♥ спереди справа, крупнее, — и три фишки перед
 * ними, одна из них лежит, на глянцевом полу.
 *
 * От блэкджека сцена отличается не только цветом: карманные тузы вместо руки
 * на 21, стопка и лежащая фишка вместо двух стоящих, разряды вместо дыма.
 * Тузы в покое движутся одной рукой — раскрываются и сходятся (`HAND`). Под
 * курсором — не тот же веер шире, а вскрытие: тузы выпрямляются и
 * поднимаются, масти обоих тузов — пика и червь — бьются в такт
 * (`.psc-show-*`, `.csn-suit-beat` в globals.css).
 */

const P = 'pk';

/** Плоскость пола: относительно неё зеркалится отражение и стоят тени фишек. */
const FLOOR = 444;

/**
 * Тузы движутся одной рукой, а не каждый сам по себе: общий период и старт,
 * наклон в разные стороны и точка поворота у нижнего края (`pivot`) — пара
 * плавно раскрывается и сходится, как карты, в которые игрок заглядывает. У
 * блэкджека карты парят порознь, и это одно из того, чем две сцены
 * различаются в покое.
 */
const HAND = { dur: 6400, delay: 0 };

/** Задняя карта мельче передней: она дальше от зрителя. */
const CARDS: CardSpec[] = [
  {
    id: 'back',
    rank: 'A',
    suit: 's',
    tone: 'steel',
    x: 112,
    y: 238,
    rot: -13,
    w: 124,
    h: 176,
    motion: { ...HAND, lift: 5, sway: -3, glow: 3800 },
    hover: 'psc-show-back',
    pivot: 'bottom',
    beat: true,
  },
  {
    id: 'front',
    rank: 'A',
    suit: 'h',
    tone: 'glow',
    x: 244,
    y: 224,
    rot: 9,
    w: 150,
    h: 212,
    motion: { ...HAND, lift: 7, sway: 3.5, glow: 3200 },
    hover: 'psc-show-front',
    pivot: 'bottom',
    beat: true,
  },
];

/** Порядок — порядок рисования: дальняя стопка, левая, передняя поверх всех. */
const CHIPS: ChipSpec[] = [
  { x: 276, y: 360, rot: -26, r: 62, k: 0.84, t: 15, stack: 2, shade: 0.6, motion: { dur: 5600, delay: 400, lift: 5, sway: -2, glow: 4400 } },
  { x: 86, y: 340, rot: 18, r: 48, k: 0.7, t: 13, stack: 1, mark: 'c', shade: 0.25, motion: { dur: 6600, delay: 1500, lift: 7, sway: 2.5, glow: 3600 } },
  { x: 172, y: 394, rot: -6, r: 68, k: 0.42, t: 15, stack: 1, shade: 0.65, motion: { dur: 5200, delay: 2200, lift: 4, sway: 0.8, glow: 4000 } },
];

const EMBERS: Ember[] = [
  [34, 432, 2.2, 10],
  [72, 462, 1.5, -6],
  [130, 452, 2.6, 8],
  [212, 470, 1.8, -10],
  [298, 448, 2.4, 12],
  [344, 404, 1.6, -5],
  [362, 468, 2, -8],
];

/** Разряды у пола — ломаные, как на снимке. У блэкджека на их месте дым. */
const CRACKS = ['M4 418 L22 410 L30 420 L48 412 L58 424 L74 418', 'M380 300 L366 312 L372 322 L356 334 L362 344 L350 356'];

export function PokerScene() {
  const ref = useRef<HTMLDivElement>(null);
  usePauseOffscreen(ref);
  // Одноразовые жесты под курсором доигрывают до конца: наведение ставит
  // data-play, снимает его конец последней анимации жеста (psc-beat).
  usePlayOnHover(ref, 'psc-beat');
  return (
    <CasinoStage p={P} scene="pscene" floor={FLOOR} stageRef={ref}>
      {/* Зарево за картами, дымка по бокам и разряды у пола — неподвижный
          рисунок на своём слое, дышит только прозрачность слоя. Движение
          должно замечаться краем глаза, а не перетягивать внимание с названий
          игр. */}
      <Fill className="csn-aura">
        <Art box={FULL}>
          <g filter={`url(#${P}-aura)`} fill="var(--csn-3)">
            <ellipse cx="196" cy="214" rx="150" ry="140" opacity="0.28" />
            {/* Дымка по бокам — внутри кадра, а не у кромки: размытое пятно,
                упёртое в край карточки, читается светлой полосой по её краю. */}
            <ellipse cx="74" cy="372" rx="44" ry="56" opacity="0.22" />
            <ellipse cx="322" cy="318" rx="40" ry="64" opacity="0.2" />
            <ellipse cx="190" cy={FLOOR + 8} rx="180" ry="24" opacity="0.45" />
          </g>
          <g stroke="var(--csn-4)" strokeLinejoin="round">
            <g filter={`url(#${P}-soft)`} strokeWidth="3" opacity="0.6">
              {CRACKS.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
            <g strokeWidth="1" opacity="0.7">
              {CRACKS.map((d) => (
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
