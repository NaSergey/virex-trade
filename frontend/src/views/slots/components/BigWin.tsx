'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { countMs, type WinTier } from '../lib/plan';
import type { Fx } from '../lib/fx';
import * as sound from '../lib/sound';

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

/**
 * Экран крупного выигрыша: лучи, золотая надпись, сумма считается вверх,
 * сверху сыплются монеты. Каждые четверть секунды — новая горсть монет и
 * звон; на трети и двух третях счёта — залп конфетти. Клик или пробел
 * досчитывает сразу, второй — закрывает.
 */
export function BigWin({
  tier,
  win,
  fx,
  audible,
  onDone,
}: {
  tier: Exclude<WinTier, 'none' | 'small' | 'nice'>;
  win: number;
  fx: Fx | null;
  audible: boolean;
  onDone: () => void;
}) {
  const t = useTranslations('slots');
  const amount = useRef<HTMLSpanElement>(null);
  const skip = useRef(false);
  const done = useRef(false);
  const finish = useRef(onDone);
  useEffect(() => {
    finish.current = onDone;
  });

  useEffect(() => {
    const dur = countMs(tier);
    const t0 = performance.now();
    let raf = 0;
    let lastTick = 0;
    let lastRain = 0;
    let volleys = 0;
    if (audible) sound.fanfare(tier === 'big' ? 0 : tier === 'mega' ? 1 : 2);
    fx?.confetti(tier === 'epic' ? 260 : 160);
    const step = (now: number) => {
      const u = skip.current ? 1 : Math.min(1, (now - t0) / dur);
      // Медленнее к концу: последние цифры набегают, как у настоящего счётчика.
      const e = 1 - (1 - u) ** 2.4;
      if (amount.current) amount.current.textContent = fmt(win * e);
      if (now - lastTick > 70 && u < 1) {
        lastTick = now;
        if (audible) sound.countTick(u);
      }
      if (now - lastRain > 260 && u < 1) {
        lastRain = now;
        fx?.rain(tier === 'epic' ? 14 : tier === 'mega' ? 10 : 6);
        if (audible) sound.coin();
      }
      if (volleys < 2 && u > (volleys + 1) / 3) {
        volleys++;
        fx?.confetti(90);
      }
      if (u < 1) raf = requestAnimationFrame(step);
      else {
        done.current = true;
        if (audible) sound.winChime(8);
        fx?.burst(window.innerWidth / 2, window.innerHeight / 2, 60, 700);
        timer = window.setTimeout(() => finish.current(), 2200);
      }
    };
    let timer = 0;
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [tier, win, fx, audible]);

  const click = () => {
    if (done.current) finish.current();
    else skip.current = true;
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      click();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });

  return (
    <div className="sl-big" data-tier={tier} onClick={click} role="dialog" aria-live="assertive">
      <div className="sl-big-rays" aria-hidden />
      <div className="sl-big-rays sl-big-rays-2" aria-hidden />
      <div className="sl-big-glow" aria-hidden />
      <div className="sl-big-body">
        <div className="sl-big-title" data-text={t(`tier.${tier}`)}>
          {t(`tier.${tier}`)}
        </div>
        <div className="sl-big-amount">
          <CoinIcon className="sl-big-coin" />
          <span ref={amount}>0</span>
        </div>
        <div className="sl-big-hint">{t('tapToContinue')}</div>
      </div>
    </div>
  );
}
