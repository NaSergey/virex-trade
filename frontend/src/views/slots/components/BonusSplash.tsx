'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { CoinIcon } from '@/shared/ui/CoinIcon';

export interface Splash {
  /** Вид: начало бонуса, добавка спинов или итог. */
  kind: 'intro' | 'toast' | 'total';
  tone: 'free' | 'pick' | 'wheel';
  title: string;
  sub?: string;
  /** Итог — сумма считается вверх. */
  amount?: number;
  /** Закрыться само через столько мс. */
  autoMs?: number;
  onDone: () => void;
}

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

/**
 * Заставка бонуса во весь экран: лучи цвета бонуса, крупная надпись, под ней
 * условия или сумма. Закрывается кликом, пробелом или сама. `toast` — малая
 * плашка поверх автомата («+4 спина»), без затемнения и без клика.
 */
export function BonusSplash({ splash }: { splash: Splash }) {
  const t = useTranslations('slots');
  const amount = useRef<HTMLSpanElement>(null);
  const done = useRef(splash.onDone);
  useEffect(() => {
    done.current = splash.onDone;
  });

  useEffect(() => {
    const id = splash.autoMs ? window.setTimeout(() => done.current(), splash.autoMs) : 0;
    let raf = 0;
    if (splash.amount !== undefined) {
      const total = splash.amount;
      const t0 = performance.now();
      const step = (now: number) => {
        const u = Math.min(1, (now - t0) / 1600);
        if (amount.current) amount.current.textContent = fmt(total * (1 - (1 - u) ** 2.4));
        if (u < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }
    if (splash.kind === 'toast') return () => clearTimeout(id);
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      done.current();
    };
    window.addEventListener('keydown', key, true);
    return () => {
      clearTimeout(id);
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', key, true);
    };
  }, [splash]);

  if (splash.kind === 'toast') {
    return (
      <div className="sl-toast" data-tone={splash.tone} role="status">
        {splash.title}
      </div>
    );
  }
  return (
    <div className="sl-splash" data-tone={splash.tone} data-kind={splash.kind} onClick={() => done.current()} role="dialog">
      <div className="sl-big-rays" aria-hidden />
      <div className="sl-splash-body">
        <div className="sl-splash-title" data-text={splash.title}>
          {splash.title}
        </div>
        {splash.sub && <div className="sl-splash-sub">{splash.sub}</div>}
        {splash.amount !== undefined && (
          <div className="sl-big-amount">
            <CoinIcon className="sl-big-coin" />
            <span ref={amount}>0</span>
          </div>
        )}
        <div className="sl-big-hint">{t('tapToContinue')}</div>
      </div>
    </div>
  );
}
