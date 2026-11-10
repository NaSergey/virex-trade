'use client';

import type { SlotsConfig, SlotSymbol } from '@/entities/slots';
import { symHref } from '@/shared/ui/SlotSymbols';
import { TICKER } from '../lib/names';

/**
 * Лента котировок над терминалом — по ней бегут символы автомата с их
 * выплатами (×3 / ×4 / ×5 в ставках на линию). Это таблица выплат в форме
 * тикера: ни одной выдуманной цены настоящей монеты.
 */
export function Ticker({ config, last }: { config: SlotsConfig; last: { win: number; bet: number }[] }) {
  const pays = Object.entries(config.linePays) as [SlotSymbol, [number, number, number]][];
  const items = (
    <>
      {pays
        .slice()
        .reverse()
        .map(([s, p]) => (
          <span key={s} className="sl-tk">
            <svg viewBox="0 0 100 100" aria-hidden>
              <use href={symHref(s)} />
            </svg>
            <b>{TICKER[s]}</b>
            <i className="up">×{p[2]}</i>
            <em>
              ×{p[1]} · ×{p[0]}
            </em>
          </span>
        ))}
      <span className="sl-tk">
        <svg viewBox="0 0 100 100" aria-hidden>
          <use href={symHref('scatter')} />
        </svg>
        <b>AIRDROP</b>
        <i className="up">FREE ×{config.freeMult}</i>
      </span>
      <span className="sl-tk">
        <b>RTP</b>
        <i className="up">{config.rtp}%</i>
      </span>
      {last.map((h, k) => (
        <span key={k} className="sl-tk">
          <b>SPIN</b>
          <i className={h.win > h.bet ? 'up' : 'down'}>
            {h.win > h.bet ? '+' : '−'}
            {Math.abs(h.win - h.bet).toLocaleString('ru-RU')}
          </i>
        </span>
      ))}
    </>
  );
  return (
    <div className="sl-ticker" aria-hidden>
      <div className="sl-ticker-run">
        {items}
        {items}
      </div>
    </div>
  );
}
