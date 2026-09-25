'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { initials, type SeatPoint } from '../lib/layout';
import { AnimatedNumber } from './AnimatedNumber';

/**
 * Плашка места: кружок с инициалами, имя и стек. Чей ход — вокруг кружка идёт
 * дуга таймера. Что лежит над плашкой и под ней (карты, ставка, подписи),
 * решает игра; справа на плашке — `children` (кнопка дилера покера).
 *
 * `stackDelay` — стек досчитывается, когда до места долетели фишки, а не когда
 * пришёл снимок.
 */
export function SeatPlate({
  label,
  name,
  stack,
  stackDelay = 0,
  turn,
  children,
}: {
  label: string;
  name: string | null;
  stack: number;
  stackDelay?: number;
  turn: { deadline: number; turnMs: number } | null;
  children?: ReactNode;
}) {
  return (
    <div className="ct-plate">
      <span className="ct-avatar" title={label}>
        {turn && <TurnTimer key={turn.deadline} deadline={turn.deadline} turnMs={turn.turnMs} />}
        <span className="ct-initials">{initials(name, label)}</span>
      </span>
      <span className="ct-info">
        <span className="ct-name">{label}</span>
        <AnimatedNumber className="ct-stack n" value={stack} delay={stackDelay} />
      </span>
      {children}
    </div>
  );
}

/** Пустое место: зрителю — приглашение сесть, сидящему — просто метка. */
export function EmptySeat({ at, canSit, onSit }: { at: SeatPoint; canSit: boolean; onSit: () => void }) {
  const t = useTranslations('cardTable');
  return (
    <div className="ct-seat ct-empty" style={{ left: `${at.x}%`, top: `${at.y}%` }}>
      {canSit ? (
        <Button variant="none" className="ct-sit" onClick={onSit}>
          {t('sit')}
        </Button>
      ) : (
        <span className="ct-sit ct-sit-off">{t('emptySeat')}</span>
      )}
    </div>
  );
}

/**
 * Дуга хода. Монтируется заново на каждый новый крайний срок (`key`), и
 * момент монтирования — единственный раз, когда читаются часы: сервер
 * присылает крайний срок, отсюда отрицательная задержка — анимация начинается
 * не с нуля, а с того места, где ход уже находится, и переживает перерисовку.
 */
function TurnTimer({ deadline, turnMs }: { deadline: number; turnMs: number }) {
  const [now] = useState(() => Date.now());
  const style = {
    '--ct-turn': `${turnMs}ms`,
    animationDelay: `${-Math.max(0, turnMs - (deadline - now))}ms`,
  } as CSSProperties;
  return <span className="ct-timer" style={style} aria-hidden />;
}
