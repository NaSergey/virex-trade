'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { useRaceJoin, type RaceView } from '@/entities/race';
import { SLOT_COLORS } from '@/widgets/race-scene';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { fmtTime } from '../lib/cars';

/** Итог: места, банк, «Ещё гонка» (та же машина и ставка) и «Сменить машину». */
export function Result({ view, onChange }: { view: RaceView; onChange: () => void }) {
  const t = useTranslations('race');
  const r = view.race!;
  const rows = r.result!;
  const join = useRaceJoin();
  const win = rows[0];
  const winner = r.racers.find((x) => x.slot === win.slot)!;
  const me = r.me;
  const mine = rows.find((x) => x.slot === me);
  const myCar = r.racers.find((x) => x.slot === me)?.car ?? 'buggy';
  const anyFin = rows.some((x) => x.finishMs !== null);
  const won = win.slot === me;
  const title = won
    ? t(win.finishMs !== null ? 'result.first' : 'result.farthest')
    : mine?.finishMs != null
      ? t('result.place', { place: mine.place })
      : t('result.dnf');
  const name = (slot: number) => {
    const p = r.racers.find((x) => x.slot === slot);
    return p?.me ? t('you') : (p?.name ?? t('anon'));
  };
  return (
    <div className="rc-result">
      <div className="rc-card">
        <div>
          <div className="rc-eyebrow">{won ? t('result.won') : t('result.over')}</div>
          <h2>{title}</h2>
        </div>
        <ol className="rc-rows">
          {rows.map((row) => {
            const p = r.racers.find((x) => x.slot === row.slot)!;
            return (
              <li key={row.slot} style={{ '--c': SLOT_COLORS[row.slot] } as CSSProperties}>
                <span className="rc-n">{row.place}</span>
                <i />
                <b>
                  {name(row.slot)}
                  <small>
                    {t(`cars.${p.car}.name`)}
                    {p.bot ? ` · ${t('lobby.bot')}` : ''}
                  </small>
                </b>
                {row.finishMs !== null ? (
                  <em>{fmtTime(row.finishMs / 1000)}</em>
                ) : (
                  <em className="out">{t('result.dnfAt', { pct: Math.round(row.progress * 100) })}</em>
                )}
              </li>
            );
          })}
        </ol>
        <p className="rc-bank-line">
          {won
            ? t(anyFin ? 'result.winYou' : 'result.winYouFar', { pot: r.pot })
            : t(anyFin ? 'result.lost' : 'result.lostFar', {
                pot: r.pot,
                name: winner.me ? t('you') : name(win.slot),
                stake: r.stake,
              })}
        </p>
        <div className="rc-actions">
          <Button
            variant="none"
            className="rc-go"
            disabled={join.isPending}
            onClick={() => join.mutate({ stake: r.stake, car: myCar })}
          >
            {t('result.again')}
          </Button>
          <Button variant="none" className="rc-ghost" onClick={onChange}>
            {t('result.change')}
          </Button>
        </div>
        <ErrorNote error={join.error} fallback={t('joinFailed')} />
      </div>
    </div>
  );
}
