'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CAR_IDS, useRaceJoin, type RaceView } from '@/entities/race';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { decodeCar, decodeStake, encodeAny } from '../lib/cars';
import { CarCard } from './CarCard';

/** Гараж: машина, ставка, «Найти гонку». Выбор помнится на устройстве. */
export function Garage({ view }: { view: RaceView }) {
  const t = useTranslations('race');
  const [car, setCar] = usePersistentValue('virex.race.car', decodeCar, 'buggy', encodeAny);
  const [saved, setStake] = usePersistentValue('virex.race.stake', decodeStake, 100, encodeAny);
  const stakes = view.config.stakes;
  const stake = stakes.includes(saved) ? saved : stakes[0];
  const join = useRaceJoin();
  return (
    <aside className="rc-panel">
      <div>
        <Link href="/games" className="rc-back">
          ← {t('back')}
        </Link>
        <h1 className="rc-title">{t('title')}</h1>
        <p className="rc-lede">{t('lede')}</p>
      </div>
      <div className="rc-block">
        <div className="rc-label">{t('carLabel')}</div>
        <div className="rc-cars">
          {CAR_IDS.map((id) => (
            <CarCard key={id} id={id} on={id === car} onPick={() => setCar(id)} />
          ))}
        </div>
      </div>
      <div className="rc-block">
        <div className="rc-label">{t('stakeLabel')}</div>
        <div className="rc-stakes">
          {stakes.map((s) => (
            <Button key={s} variant="none" aria-pressed={s === stake} onClick={() => setStake(s)}>
              {s}
            </Button>
          ))}
        </div>
      </div>
      <Button variant="none" className="rc-go" disabled={join.isPending} onClick={() => join.mutate({ stake, car })}>
        {t('find', { stake })}
      </Button>
      <ErrorNote error={join.error} fallback={t('joinFailed')} />
      <p className="rc-note">{t('controls')}</p>
    </aside>
  );
}
