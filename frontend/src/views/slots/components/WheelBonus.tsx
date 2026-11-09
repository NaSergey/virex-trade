'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { SlotsBonus } from '@/entities/slots';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import type { Fx } from '../lib/fx';
import * as sound from '../lib/sound';

type Wheel = Extract<SlotsBonus, { kind: 'wheel' }>;

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
const COLORS = ['#c4122e', '#1a1a2e', '#d48a00', '#0f5fa8', '#7a1fb0', '#1f8a3a', '#c4122e', '#d46a00'];
const SPIN_MS = 6200;
const TURNS = 6;

/**
 * Колесо фортуны: шестнадцать равных секторов, игрок жмёт «Крутить».
 * Сектор выбрал сервер (`index`), колесо делает шесть оборотов и тормозит
 * ровно на нём — секторы одного размера и равновероятны, так что колесо
 * не врёт глазу.
 *
 * Угол пишется в DOM кадром, а не CSS-переходом: на каждом штыре, который
 * проходит язычок, — щелчок и рывок язычка, а переход не говорит, где он.
 */
export function WheelBonus({
  bonus,
  fx,
  audible,
  auto,
  onDone,
}: {
  bonus: Wheel;
  fx: Fx | null;
  audible: boolean;
  auto: boolean;
  onDone: () => void;
}) {
  const t = useTranslations('slots');
  const disc = useRef<HTMLDivElement>(null);
  const flap = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'ready' | 'spinning' | 'won'>('ready');
  const finish = useRef(onDone);
  useEffect(() => {
    finish.current = onDone;
  });
  const n = bonus.segments.length;
  const seg = 360 / n;

  const spin = () => {
    if (state !== 'ready') return;
    setState('spinning');
    // Сектор index стоит центром на угле index·seg; под язычок сверху его
    // приводит поворот на −index·seg, плюс целые обороты и чуть случайности
    // внутри сектора.
    const jitter = (Math.random() - 0.5) * seg * 0.6;
    const target = TURNS * 360 + (360 - bonus.index * seg) + jitter;
    const t0 = performance.now();
    let lastPeg = 0;
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / SPIN_MS);
      // Разгон за десятую часть, потом долгое торможение.
      const e = u < 0.08 ? (u / 0.08) ** 2 * 0.04 : 0.04 + 0.96 * (1 - (1 - (u - 0.08) / 0.92) ** 3.2);
      const angle = target * e;
      if (disc.current) disc.current.style.transform = `rotate(${angle.toFixed(2)}deg)`;
      const peg = Math.floor((angle + seg / 2) / seg);
      if (peg !== lastPeg) {
        lastPeg = peg;
        if (audible) sound.wheelTick();
        flap.current?.animate([{ rotate: '-28deg' }, { rotate: '0deg' }], { duration: 140, easing: 'ease-out' });
      }
      if (u < 1) requestAnimationFrame(step);
      else {
        setState('won');
        if (audible) sound.fanfare(bonus.win >= bonus.segments[0] * 10 ? 2 : 1);
        fx?.burst(window.innerWidth / 2, window.innerHeight / 2, 70, 700);
        fx?.confetti(120);
        fx?.rain(30);
      }
    };
    requestAnimationFrame(step);
  };

  useEffect(() => {
    if (state === 'ready' && auto) {
      const id = window.setTimeout(spin, 900);
      return () => clearTimeout(id);
    }
    if (state === 'won') {
      const id = window.setTimeout(() => finish.current(), auto ? 2800 : 5000);
      return () => clearTimeout(id);
    }
  });

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      if (state === 'ready') spin();
      else if (state === 'won') finish.current();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });

  const r = 46;
  const at = (a: number, rr: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return `${(50 + Math.cos(rad) * rr).toFixed(3)} ${(50 + Math.sin(rad) * rr).toFixed(3)}`;
  };

  return (
    <div className="sl-bonus sl-wheel" data-state={state} role="dialog" aria-label={t('wheel.title')}>
      <div className="sl-big-rays" aria-hidden />
      <div className="sl-bonus-head">
        <div className="sl-bonus-title" data-text={t('wheel.title')}>
          {t('wheel.title')}
        </div>
        <p>{state === 'won' ? t('wheel.won') : t('wheel.hint')}</p>
      </div>
      <div className="sl-wheel-box">
        <div className="sl-wheel-rim" aria-hidden>
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i} style={{ ['--i' as string]: i }} />
          ))}
        </div>
        <div className="sl-wheel-disc" ref={disc}>
          <svg viewBox="0 0 100 100" aria-hidden>
            {bonus.segments.map((v, i) => {
              const a0 = i * seg - seg / 2;
              const a1 = a0 + seg;
              return (
                <g key={i}>
                  <path
                    d={`M50 50 L${at(a0, r)} A${r} ${r} 0 0 1 ${at(a1, r)} Z`}
                    fill={COLORS[i % COLORS.length]}
                    stroke="#ffd34a"
                    strokeWidth="0.5"
                    className={state === 'won' && i === bonus.index ? 'sl-wheel-win' : undefined}
                  />
                  <text
                    x="50"
                    y="11"
                    transform={`rotate(${i * seg} 50 50)`}
                    textAnchor="middle"
                    fontSize={String(v).length > 4 ? 3.4 : 4.4}
                    fontWeight="800"
                    fill="#fff"
                    stroke="#000"
                    strokeWidth="0.25"
                    paintOrder="stroke"
                  >
                    {fmt(v)}
                  </text>
                </g>
              );
            })}
            <circle cx="50" cy="50" r="10" fill="url(#sl-g-gold)" stroke="#5a3200" strokeWidth="0.8" />
            <circle cx="50" cy="50" r="4" fill="#c4122e" />
          </svg>
        </div>
        <div className="sl-wheel-flap" ref={flap} aria-hidden />
        <div className="sl-wheel-glass" aria-hidden />
      </div>
      {state === 'won' ? (
        <div className="sl-bonus-foot">
          <div className="sl-big-amount">
            <CoinIcon className="sl-big-coin" />
            {fmt(bonus.win)}
          </div>
          <button type="button" className="sl-bonus-go" onClick={() => finish.current()}>
            {t('wheel.take')}
          </button>
        </div>
      ) : (
        <button type="button" className="sl-bonus-go sl-bonus-go-big" onClick={spin} disabled={state !== 'ready'}>
          {t('wheel.spin')}
        </button>
      )}
    </div>
  );
}
