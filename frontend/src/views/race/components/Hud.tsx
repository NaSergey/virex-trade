'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { CARS, COUNTDOWN, VMAX, type RaceView } from '@/entities/race';
import { SLOT_COLORS } from '@/widgets/race-scene';
import { cn } from '@/shared/lib/utils/css';
import { fmtTime } from '../lib/cars';
import type { FeedText, LiveHud } from '../model/liveSource';

/** Цифры гонки поверх сцены: место, полоса трассы, банк и время, лента, прочность, скорость. */
export function Hud({ hud, view }: { hud: LiveHud; view: RaceView }) {
  const t = useTranslations('race');
  const r = view.race!;
  const meRacer = hud.me !== null ? r.racers.find((x) => x.slot === hud.me) : undefined;
  const nameOf = (slot: number) => {
    const p = r.racers.find((x) => x.slot === slot);
    return p?.me ? t('you') : (p?.name ?? t('anon'));
  };
  const say = (x: FeedText) =>
    x.k === 'hit'
      ? t(`feed.${x.cause}`, { dmg: x.dmg })
      : x.k === 'out'
        ? t('feed.out', { cause: t(`cause.${x.cause}`) })
        : x.k === 'finish'
          ? t(x.first ? 'feed.finishFirst' : 'feed.finish')
          : t('feed.slide');
  const watching = hud.meDead && view.phase !== 'over';
  return (
    <div className="rc-hud">
      <div className="rc-hud-top">
        <div className="rc-place">
          {hud.meDead || !hud.place ? '—' : hud.place}
          <small>/3</small>
          <span className="rc-k">{t('hud.place')}</span>
        </div>
        <div className="rc-track">
          <div className="rc-track-line" />
          <div className="rc-track-flag" />
          {hud.progress.map((p, slot) => (
            <div
              key={slot}
              className={cn('rc-mk', slot === hud.me && 'me', hud.dead[slot] && 'dead')}
              style={{ left: `${(p * 100).toFixed(2)}%`, '--c': SLOT_COLORS[slot] } as CSSProperties}
            >
              <i />
              {slot === hud.me && <span>{t('you')}</span>}
            </div>
          ))}
        </div>
        <div className="rc-bank">
          <div className="rc-k">{t('hud.bank')}</div>
          <div className="rc-v">{r.pot}</div>
          <div className="rc-t">{fmtTime(Math.max(0, hud.t - COUNTDOWN))}</div>
        </div>
      </div>
      <div className="rc-feed">
        {hud.feed.map((f) => (
          <div key={f.id} style={{ '--c': SLOT_COLORS[f.slot] } as CSSProperties}>
            <b>{nameOf(f.slot)}</b> · {say(f.text)}
          </div>
        ))}
      </div>
      {watching && (
        <div className="rc-spect">
          <b>{t('hud.out')}</b>
          <span>{hud.cam === hud.me ? t('hud.watchNext') : t('hud.watching', { name: nameOf(hud.cam) })}</span>
        </div>
      )}
      {meRacer && (
        <div className="rc-hud-bottom">
          <div>
            <div className="rc-k">{t('hud.hp', { car: t(`cars.${meRacer.car}.name`) })}</div>
            <div className="rc-segs">
              {Array.from({ length: CARS[meRacer.car].hp }, (_, i) => (
                <i key={i} className={i < hud.hp ? undefined : 'off'} />
              ))}
            </div>
          </div>
          <div className="rc-spd">
            <div className="rc-k">{t('hud.speed')}</div>
            <span className="rc-v">{Math.round((hud.speed / VMAX) * 268)}</span>
            <small>{t('hud.kmh')}</small>
          </div>
        </div>
      )}
      {hud.lights > 0 && (
        <div className="rc-lights" aria-hidden>
          {[1, 2, 3].map((n) => (
            <i key={n} className={hud.lights === 4 ? 'go' : n <= hud.lights ? 'on' : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}
