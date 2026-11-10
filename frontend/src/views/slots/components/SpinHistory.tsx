'use client';

import { useTranslations } from 'next-intl';
import { timeFormat } from '../lib/time';

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

/**
 * История спинов сессии — как история сделок на бирже: время, ставка,
 * выплата, результат и множитель. Результат — честный: ставка вычтена, минус
 * красный. Хранится в памяти страницы — уйдёшь, история сессии кончится.
 */
export function SpinHistory({ rows }: { rows: { id: string; at: number; bet: number; win: number; bonus: string }[] }) {
  const t = useTranslations('slots');
  return (
    <section className="sl-hist">
      <header>
        <b>{t('hist.title')}</b>
        <span>{t('hist.note')}</span>
      </header>
      <div className="sl-hist-scroll">
        <table>
          <thead>
            <tr>
              <th>{t('hist.time')}</th>
              <th>{t('hist.bet')}</th>
              <th>{t('hist.payout')}</th>
              <th>{t('hist.result')}</th>
              <th>{t('hist.x')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="sl-hist-empty">
                  {t('hist.empty')}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const net = r.win - r.bet;
              return (
                <tr key={r.id}>
                  <td>{timeFormat.format(r.at)}</td>
                  <td>{fmt(r.bet)}</td>
                  <td>{fmt(r.win)}</td>
                  <td className={net > 0 ? 'up' : 'down'}>
                    {net > 0 ? '+' : '−'}
                    {fmt(Math.abs(net))}
                    {r.bonus && <em>{r.bonus.split(' ').map((b) => t(`hist.bonus.${b}`)).join(' · ')}</em>}
                  </td>
                  <td className={net > 0 ? 'up' : ''}>×{(r.win / r.bet).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
