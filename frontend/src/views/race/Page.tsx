'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LiveStore, useRace, useRaceSocket } from '@/entities/race';
import { createAttract, RaceCanvas } from '@/widgets/race-scene';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Garage } from './components/Garage';
import { Live } from './components/Live';
import { Lobby } from './components/Lobby';

/**
 * Гонки — /games/race. Гараж и лобби — поверх показа (боты едут в браузере);
 * гонка — сцена по снимкам сервера, своя машина — предсказанием. Первый вид —
 * REST, дальше сокет; вход и выход — REST. Спека — `2026-10-18-race-game-design.md`.
 */
export function RacePage() {
  const t = useTranslations('race');
  const { data: view, error, isLoading } = useRace();
  const [store] = useState(() => new LiveStore());
  useEffect(() => {
    if (view) store.push(view);
  }, [view, store]);
  const send = useRaceSocket(view?.race?.id ?? null, store);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const phase = view?.phase === 'over' && view.race?.id === dismissed ? 'none' : view?.phase;
  const live = phase === 'countdown' || phase === 'racing' || phase === 'over';

  return (
    <div className="rc-page">
      {!view ? (
        isLoading ? (
          <p className="rc-wait">{t('loading')}</p>
        ) : (
          <ErrorNote error={error} fallback={t('loadFailed')} />
        )
      ) : live ? (
        <Live key={view.race!.id} view={view} store={store} send={send} onChange={() => setDismissed(view.race!.id)} />
      ) : (
        <>
          <Attract />
          {phase === 'lobby' ? <Lobby view={view} /> : <Garage view={view} />}
        </>
      )}
    </div>
  );
}

function Attract() {
  const [src] = useState(createAttract);
  return <RaceCanvas source={src} className="rc-canvas" />;
}
