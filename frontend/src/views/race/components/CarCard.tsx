'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { CARS, type CarId } from '@/entities/race';
import { drawCarPreview, SLOT_COLORS } from '@/widgets/race-scene';
import { Button } from '@/shared/ui/Button';
import { CAR_PIPS } from '../lib/cars';

function Pips({ label, n }: { label: string; n: number }) {
  return (
    <span className="rc-stat">
      <span>{label}</span>
      <span className="rc-pips">
        {Array.from({ length: 5 }, (_, i) => (
          <i key={i} className={i < n ? 'on' : undefined} />
        ))}
      </span>
    </span>
  );
}

/** Машина гаража: вид сзади той же кистью, что на трассе, и три шкалы. */
export function CarCard({ id, on, onPick }: { id: CarId; on: boolean; onPick: () => void }) {
  const t = useTranslations('race');
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawCarPreview(ref.current, id, SLOT_COLORS[0]);
  }, [id]);
  return (
    <Button variant="none" className="rc-car" aria-pressed={on} onClick={onPick}>
      <canvas ref={ref} width={224} height={140} aria-hidden />
      <span className="rc-car-body">
        <span className="rc-car-name">{t(`cars.${id}.name`)}</span>
        <span className="rc-car-line">{t(`cars.${id}.line`)}</span>
        <Pips label={t('stat.speed')} n={CAR_PIPS[id].speed} />
        <Pips label={t('stat.grip')} n={CAR_PIPS[id].grip} />
        <Pips label={t('stat.armor')} n={CARS[id].hp} />
      </span>
    </Button>
  );
}
