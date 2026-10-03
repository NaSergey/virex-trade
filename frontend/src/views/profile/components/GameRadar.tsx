'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import type { ProfileGame } from '@/entities/profile';
import { byFrequency, radarPoint } from '../lib/charts';
import { Panel } from './Panel';

/** Холст паутинки в своих единицах; на странице он тянется по ширине панели. */
const W = 360;
const H = 250;
const CX = W / 2;
const CY = 128;
const R = 84;
const RINGS = [0.25, 0.5, 0.75, 1];

/**
 * Осей не больше этого: игр будет двадцать и больше, а паутинка на двадцать
 * осей — ёж, на котором ничего не прочитать. Остальные — в таблице игр.
 */
const AXES = 6;

const polygon = (n: number, value: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => {
    const p = radarPoint(i, n, value(i), R, CX, CY);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' ');

/**
 * Где человек играет: ось — игра, значение — дней за 90, в которые он в неё
 * играл. Дни, а не действия: раунд джетпака длится секунды, турнир — часы, и
 * счёт действий рисовал бы один джетпак. Форма нормирована на самую частую
 * игру — паутинка про соотношение, а абсолютное число стоит в подписи оси.
 */
export function GameRadar({ games: all }: { games: ProfileGame[] }) {
  const t = useTranslations('profile');
  const games = byFrequency(all).slice(0, AXES);
  const n = games.length;
  const gid = useId();
  const max = Math.max(0, ...games.map((g) => g.days90));

  return (
    <Panel title={t('radar')} tone="cyan" aside={<span className="pf-note">{t('radarNote')}</span>}>
      {max === 0 ? (
        <p className="pf-empty muted">{t('radarEmpty')}</p>
      ) : (
        <svg className="pf-radar" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('radar')}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" className="pf-radar-g0" />
              <stop offset="1" className="pf-radar-g1" />
            </linearGradient>
          </defs>
          {RINGS.map((k) => (
            <polygon key={k} className="pf-radar-ring" points={polygon(n, () => k)} />
          ))}
          {games.map((g, i) => {
            const end = radarPoint(i, n, 1, R, CX, CY);
            return <line key={g.id} className="pf-radar-axis" x1={CX} y1={CY} x2={end.x} y2={end.y} />;
          })}
          <polygon
            className="pf-radar-shape"
            fill={`url(#${gid})`}
            points={polygon(n, (i) => games[i].days90 / max)}
          />
          {games.map((g, i) => {
            const p = radarPoint(i, n, games[i].days90 / max, R, CX, CY);
            return <circle key={g.id} className="pf-radar-dot" cx={p.x} cy={p.y} r={3.5} />;
          })}
          {games.map((g, i) => {
            // Подпись — за концом оси; сторону выравнивания выбирает её угол.
            const p = radarPoint(i, n, 1, R * 1.24, CX, CY);
            const anchor = Math.abs(p.x - CX) < 8 ? 'middle' : p.x > CX ? 'start' : 'end';
            return (
              <text key={g.id} x={p.x} y={p.y} textAnchor={anchor} className="pf-radar-label">
                <tspan x={p.x} className="pf-radar-v">
                  {t('days', { days: g.days90 })}
                </tspan>
                <tspan x={p.x} dy={13}>
                  {t(`game.${g.id}`)}
                </tspan>
              </text>
            );
          })}
        </svg>
      )}
    </Panel>
  );
}
