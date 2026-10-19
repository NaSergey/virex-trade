'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { useRaceLeave, type RaceView } from '@/entities/race';
import { SLOT_COLORS } from '@/widgets/race-scene';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';

/** Лобби: три места, бот подписан, отсчёт до ботов, выход с возвратом ставки. */
export function Lobby({ view }: { view: RaceView }) {
  const t = useTranslations('race');
  const r = view.race!;
  const leave = useRaceLeave();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((r.lobbyEndsAt - (now + view.offset)) / 1000));
  return (
    <aside className="rc-panel">
      <div className="rc-block">
        <div className="rc-label">{t('lobby.head')}</div>
        <ol className="rc-slots">
          {[0, 1, 2].map((slot) => {
            const p = r.racers.find((x) => x.slot === slot);
            return (
              <li
                key={slot}
                data-wait={p ? undefined : ''}
                style={p ? ({ '--c': SLOT_COLORS[slot] } as CSSProperties) : undefined}
              >
                <i />
                <span>
                  <b>{p ? (p.me ? t('you') : (p.name ?? t('anon'))) : t('lobby.waiting')}</b>
                  {p && <span className="rc-slot-car"> {t(`cars.${p.car}.name`)}</span>}
                </span>
                <em>{p ? (p.bot ? t('lobby.bot') : p.me ? t('lobby.stake', { stake: r.stake }) : '') : ''}</em>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="rc-pot">
        <span>{t('lobby.pot')}</span>
        <b>{r.pot}</b>
      </div>
      <p className="rc-note">{t('lobby.botsIn', { sec: left })}</p>
      <Button variant="none" className="rc-ghost" disabled={leave.isPending} onClick={() => leave.mutate()}>
        {t('lobby.leave')}
      </Button>
      <ErrorNote error={leave.error} fallback={t('leaveFailed')} />
    </aside>
  );
}
