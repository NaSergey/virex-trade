'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { BIG_STEPS, countMs, tierOf, type BigTier } from '../lib/plan';
import type { Fx } from '../lib/fx';
import { buzz } from '../lib/haptics';
import * as sound from '../lib/sound';

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

/**
 * Экран крупного выигрыша. Начинается с BIG и **повышается по ходу счёта**:
 * сумма переходит ×30 — MEGA, ×80 — EPIC, ×200 — LEGENDARY. На каждой ступени
 * надпись взрывается новой, бьёт фанфара, взлетает фейерверк, экран
 * вздрагивает, а лучи раскручиваются быстрее. Между ступенями — дождь монет,
 * звон и фейерверк тем чаще, чем выше ступень.
 *
 * Клик или пробел досчитывает сразу (до итоговой ступени), второй — закрывает.
 */
export function BigWin({
  win,
  bet,
  fx,
  audible,
  onDone,
}: {
  win: number;
  bet: number;
  fx: Fx | null;
  audible: boolean;
  onDone: () => void;
}) {
  const t = useTranslations('slots');
  const final = tierOf(win, bet) as BigTier;
  const [stage, setStage] = useState<BigTier>('big');
  const amount = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const skip = useRef(false);
  const done = useRef(false);
  const finish = useRef(onDone);
  useEffect(() => {
    finish.current = onDone;
  });

  useEffect(() => {
    const dur = countMs(final);
    const t0 = performance.now();
    let raf = 0;
    let timer = 0;
    let lastTick = 0;
    let lastRain = 0;
    let lastRocket = 0;
    let level = 0;
    if (audible) sound.fanfare(0);
    buzz([60, 40, 60]);
    fx?.confetti(140);
    fx?.fireworks(3);

    const up = (next: number) => {
      level = next;
      setStage(BIG_STEPS[next][0]);
      if (audible) sound.levelUp(next);
      buzz([90, 50, 90, 50, 140]);
      fx?.fireworks(3 + next * 2);
      fx?.confetti(80 + next * 40);
      fx?.burst(window.innerWidth / 2, window.innerHeight / 2, 50 + next * 20, 800);
      const el = box.current;
      if (el) {
        el.removeAttribute('data-up');
        void el.offsetWidth;
        el.setAttribute('data-up', '');
      }
    };

    const step = (now: number) => {
      const u = skip.current ? 1 : Math.min(1, (now - t0) / dur);
      const value = win * (1 - (1 - u) ** 2.2);
      if (amount.current) amount.current.textContent = fmt(value);
      // Ступени — по сумме на счётчике, а не по времени: повышение видно на числе.
      let reached = 0;
      for (let i = 0; i < BIG_STEPS.length; i++) if (value >= BIG_STEPS[i][1] * bet) reached = i;
      if (reached > level) up(reached);
      if (u < 1) {
        if (now - lastTick > 65) {
          lastTick = now;
          if (audible) sound.countTick(u);
        }
        if (now - lastRain > 240) {
          lastRain = now;
          fx?.rain(6 + level * 4);
          if (audible) sound.coin();
        }
        if (level >= 1 && now - lastRocket > 1100 - level * 250) {
          lastRocket = now;
          fx?.fireworks(1 + level);
          if (audible) sound.pop();
        }
        raf = requestAnimationFrame(step);
      } else {
        done.current = true;
        if (audible) sound.winChime(8);
        fx?.burst(window.innerWidth / 2, window.innerHeight / 2, 80, 900);
        fx?.fireworks(4 + level * 2);
        timer = window.setTimeout(() => finish.current(), 2600);
      }
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [final, win, bet, fx, audible]);

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
    <div className="sl-big" data-tier={stage} onClick={click} role="dialog" aria-live="assertive" ref={box}>
      <div className="sl-big-rays" aria-hidden />
      <div className="sl-big-rays sl-big-rays-2" aria-hidden />
      <div className="sl-big-glow" aria-hidden />
      <div className="sl-big-body">
        <div key={stage} className="sl-big-title" data-text={t(`tier.${stage}`)}>
          {t(`tier.${stage}`)}
        </div>
        <div className="sl-big-amount">
          <CoinIcon className="sl-big-coin" />
          <span ref={amount}>0</span>
        </div>
        <div className="sl-big-x">×{Math.floor(win / bet)}</div>
        <div className="sl-big-hint">{t('tapToContinue')}</div>
      </div>
    </div>
  );
}
