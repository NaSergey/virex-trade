'use client';

import { useTranslations } from 'next-intl';
import type { SlotsConfig, SlotSymbol } from '@/entities/slots';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { symHref } from '@/shared/ui/SlotSymbols';
import { LINE_COLORS } from './WinLines';

const ORDER: SlotSymbol[] = ['diamond', 'seven', 'bar', 'bell', 'grapes', 'plum', 'lemon', 'cherry'];

function Sym({ s }: { s: SlotSymbol }) {
  return (
    <svg className="sl-pt-sym" viewBox="0 0 100 100" aria-hidden>
      <use href={symHref(s)} />
    </svg>
  );
}

/**
 * Таблица выплат — суммы сразу в монетах для текущей ставки: «×50 на линию»
 * человеку пришлось бы переводить в голове. Числа — с сервера.
 */
export function Paytable({ config, bet, onClose }: { config: SlotsConfig; bet: number; onClose: () => void }) {
  const t = useTranslations('slots');
  const lineBet = bet / config.paylines.length;
  return (
    <div className="sl-pt" role="dialog" aria-label={t('paytable')} onClick={onClose}>
      <div className="sl-pt-card" onClick={(e) => e.stopPropagation()}>
        <div className="sl-pt-head">
          <h2>{t('paytable')}</h2>
          <button type="button" className="sl-pt-x" onClick={onClose} aria-label={t('close')}>
            ✕
          </button>
        </div>
        <div className="sl-pt-grid">
          {ORDER.map((s) => {
            const pays = config.linePays[s];
            if (!pays) return null;
            return (
              <div key={s} className="sl-pt-row">
                <Sym s={s} />
                <dl>
                  {[2, 1, 0].map((k) => (
                    <div key={k}>
                      <dt>{k + 3}×</dt>
                      <dd>
                        {(pays[k] * lineBet).toLocaleString('ru-RU')}
                        <CoinIcon className="sl-pt-coin" />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
        <div className="sl-pt-special">
          <div className="sl-pt-row">
            <Sym s="wild" />
            <p>{t('wildInfo')}</p>
          </div>
        </div>
        <h3>{t('bonuses')}</h3>
        <div className="sl-pt-special">
          <div className="sl-pt-row">
            <Sym s="scatter" />
            <p>
              <b>{t('free.title')}.</b>{' '}
              {t('free.rule', {
                a: config.freeSpins[0],
                b: config.freeSpins[1],
                c: config.freeSpins[2],
                x: config.freeMult,
              })}
            </p>
          </div>
          <div className="sl-pt-row">
            <Sym s="chest" />
            <p>
              <b>{t('pick.title')}.</b>{' '}
              {t('pick.rule', {
                n: config.pickBoxes,
                max: (Math.max(...config.pickPrizes) * bet).toLocaleString('ru-RU'),
              })}
            </p>
          </div>
          <div className="sl-pt-row">
            <Sym s="wheel" />
            <p>
              <b>{t('wheel.title')}.</b>{' '}
              {t('wheel.rule', {
                n: config.wheel.length,
                min: (Math.min(...config.wheel) * bet).toLocaleString('ru-RU'),
                max: (Math.max(...config.wheel) * bet).toLocaleString('ru-RU'),
              })}
            </p>
          </div>
        </div>
        <h3>{t('lines')}</h3>
        <div className="sl-pt-lines">
          {config.paylines.map((rows, i) => (
            <svg key={i} viewBox="0 0 50 30" className="sl-pt-line" aria-label={`${i + 1}`}>
              {Array.from({ length: 15 }, (_, c) => (
                <rect key={c} x={(c % 5) * 10 + 1} y={Math.floor(c / 5) * 10 + 1} width="8" height="8" className="sl-pt-cell" />
              ))}
              <polyline
                points={rows.map((r, x) => `${x * 10 + 5},${r * 10 + 5}`).join(' ')}
                fill="none"
                stroke={LINE_COLORS[i]}
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <text x="2" y="29" fontSize="6" fill={LINE_COLORS[i]}>
                {i + 1}
              </text>
            </svg>
          ))}
        </div>
        <p className="sl-pt-note">{t('rules', { rtp: config.rtp })}</p>
      </div>
    </div>
  );
}
