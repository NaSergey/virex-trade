'use client';

import { useId } from 'react';
import { cn } from '@/shared/lib/utils/css';

/**
 * Предмет награды: чем больше награда, тем больше предмет — монета, стопка,
 * горка, сундук. Окна наград (ежедневная и сезон) рисуют им свои карточки
 * вместо плоских прямоугольников с числом: размер награды читается раньше,
 * чем прочитана сумма.
 *
 * Монеты — всегда золото: это сама валюта. Краска сундука — цвет окна
 * (`--rw`, `--rw-rgb` у `.dlg-reward`). Крышка сундука открывается классом
 * `is-open` (CSS-переход, `.ri-lid`).
 *
 * id градиентов — свои у каждого предмета (`useId`): в окне их до пятидесяти,
 * а одинаковый id разрешается в первое определение документа.
 */
export type RewardItemKind = 'coin' | 'stack' | 'pile' | 'chest';

/** Какой предмет у суммы — по доле от самой крупной суммы ряда. */
export function rewardItemOf(coins: number, max: number): RewardItemKind {
  const k = max > 0 ? coins / max : 0;
  if (k >= 0.999) return 'chest';
  if (k >= 0.6) return 'pile';
  if (k >= 0.3) return 'stack';
  return 'coin';
}

/** Монета в ракурсе: ребро — тёмный эллипс под лицом. */
function Coin({ x, y, r, g }: { x: number; y: number; r: number; g: string }) {
  const ry = r * 0.42;
  return (
    <g>
      <ellipse cx={x} cy={y + r * 0.22} rx={r} ry={ry} fill="#8a5a0c" />
      <rect x={x - r} y={y} width={r * 2} height={r * 0.22} fill="#a8700f" />
      <ellipse cx={x} cy={y} rx={r} ry={ry} fill={`url(#${g}-face)`} />
      <ellipse cx={x} cy={y} rx={r * 0.68} ry={ry * 0.68} fill="none" stroke="#fff3c4" strokeOpacity="0.55" strokeWidth="1" />
    </g>
  );
}

/** Стопка монет снизу вверх. */
function Stack({ x, y, n, r, g }: { x: number; y: number; n: number; r: number; g: string }) {
  const step = r * 0.34;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <Coin key={i} x={x} y={y - i * step} r={r} g={g} />
      ))}
    </g>
  );
}

export function RewardItem({
  kind,
  open = false,
  className,
}: {
  kind: RewardItemKind;
  /** Только у сундука: крышка открыта. */
  open?: boolean;
  className?: string;
}) {
  const g = useId().replace(/:/g, '');

  return (
    <svg
      className={cn('ri', `ri-${kind}`, open && 'is-open', className)}
      viewBox="0 0 64 64"
      aria-hidden
      // Тень и блики рисуются за краем кадра — обрезать их нечем.
      overflow="visible"
    >
      <defs>
        <radialGradient id={`${g}-face`} cx="38%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fff6c9" />
          <stop offset="0.35" stopColor="#ffd34d" />
          <stop offset="1" stopColor="#d9930f" />
        </radialGradient>
        <linearGradient id={`${g}-wood`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="ri-wood-0" />
          <stop offset="1" className="ri-wood-1" />
        </linearGradient>
        <radialGradient id={`${g}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff2b0" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffb700" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Тень на подставке — пятно, которое сажает предмет на плоскость. */}
      <ellipse className="ri-shadow" cx="32" cy="57" rx="22" ry="4" />

      {kind === 'coin' && (
        <g className="ri-body">
          <Coin x={32} y={40} r={14} g={g} />
        </g>
      )}
      {kind === 'stack' && (
        <g className="ri-body">
          <Stack x={32} y={50} n={5} r={14} g={g} />
        </g>
      )}
      {kind === 'pile' && (
        <g className="ri-body">
          <Stack x={22} y={52} n={4} r={11} g={g} />
          <Stack x={42} y={52} n={6} r={11} g={g} />
          <Stack x={32} y={56} n={2} r={12} g={g} />
        </g>
      )}
      {kind === 'chest' && (
        <g className="ri-body">
          {/* Свет из открытого сундука — за крышкой, видно только открытым. */}
          <ellipse className="ri-shine" cx="32" cy="30" rx="26" ry="20" fill={`url(#${g}-glow)`} />
          {/* Монеты внутри — видны, когда крышка поднята. */}
          <g className="ri-loot">
            <Coin x={24} y={32} r={8} g={g} />
            <Coin x={38} y={31} r={9} g={g} />
            <Coin x={31} y={28} r={8} g={g} />
          </g>
          {/* Корпус */}
          <rect x="10" y="32" width="44" height="22" fill={`url(#${g}-wood)`} />
          <rect x="10" y="32" width="44" height="3" fill="#ffd34d" />
          <rect x="10" y="51" width="44" height="3" fill="#c9890c" />
          <rect x="15" y="32" width="4" height="22" fill="#e6a91e" />
          <rect x="45" y="32" width="4" height="22" fill="#e6a91e" />
          <rect x="27" y="36" width="10" height="11" fill="#ffd34d" />
          <rect x="31" y="39" width="2" height="5" fill="#5a3a06" />
          {/* Крышка — поворачивается вокруг заднего ребра (`transform-origin` в CSS). */}
          <g className="ri-lid">
            <path d="M10 32 V24 Q10 14 32 14 Q54 14 54 24 V32 Z" fill={`url(#${g}-wood)`} />
            <path d="M10 32 V24 Q10 14 32 14 Q54 14 54 24 V32" fill="none" stroke="#ffd34d" strokeWidth="2.5" />
            <rect x="15" y="15.5" width="4" height="16.5" fill="#e6a91e" />
            <rect x="45" y="15.5" width="4" height="16.5" fill="#e6a91e" />
            <path d="M14 22 Q32 16 50 22" fill="none" stroke="#fff" strokeOpacity="0.25" strokeWidth="1.5" />
          </g>
        </g>
      )}
    </svg>
  );
}
