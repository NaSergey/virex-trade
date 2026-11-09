'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCoinBalance } from '@/entities/coins';
import { useSlotsSpin, type SlotsConfig, type SlotsSpin, type SlotSymbol } from '@/entities/slots';
import { audioContext } from '@/shared/lib/sound/player';
import { useAudioChannel } from '@/shared/lib/sound/useAudioChannel';
import { cn } from '@/shared/lib/utils/css';
import { AudioControl } from '@/shared/ui/AudioControl';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { Fx } from '../lib/fx';
import { countMs, fillerSymbol, randomGrid, stopPlan, tierOf, type StopPlan, type WinTier } from '../lib/plan';
import { Reel } from '../lib/reel';
import * as sound from '../lib/sound';
import { BigWin } from './BigWin';
import { Paytable } from './Paytable';
import { LINE_COLORS, WinLines } from './WinLines';

const REELS = 5;
const POOL = 5;
const BULBS = 22;
const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

type Phase = 'idle' | 'spinning' | 'present';
type BigTier = Exclude<WinTier, 'none' | 'small' | 'nice'>;

/** Перезапустить CSS-анимацию по атрибуту: снять, дать браузеру заметить, поставить. */
function kick(el: Element | null, attr: string) {
  if (!el) return;
  el.removeAttribute(attr);
  void (el as HTMLElement).offsetWidth;
  el.setAttribute(attr, '');
}

const centerOf = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
};

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Автомат: пять барабанов, десять линий. Исход спина решает сервер, экран
 * только проигрывает его — барабаны начинают крутиться сразу по нажатию, а
 * встают, когда ответ пришёл и прошло минимальное время раскрутки.
 *
 * Всё, что двигается каждый кадр (ленты барабанов, счётчики, частицы), пишется
 * в DOM и на холст напрямую. Состояние React меняется только на событиях
 * спина: пуск, предвкушение, итог.
 */
export function Machine({ config }: { config: SlotsConfig }) {
  const t = useTranslations('slots');
  const qc = useQueryClient();
  const spinReq = useSlotsSpin();
  const { data: coins } = useCoinBalance();
  const sfx = useAudioChannel('virex.slots.sound', 0.8);

  const [betIdx, setBetIdx] = useState(0);
  const [turbo, setTurbo] = useState(false);
  const [auto, setAuto] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [hot, setHot] = useState(-1);
  const [shown, setShown] = useState<SlotsSpin | null>(null);
  const [tier, setTier] = useState<WinTier>('none');
  const [cycling, setCycling] = useState(false);
  const [big, setBig] = useState<{ tier: BigTier; win: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [paytable, setPaytable] = useState(false);
  const [pulled, setPulled] = useState(0);

  const bet = config.bets[betIdx];
  const balance = coins?.balance ?? null;

  const page = useRef<HTMLDivElement>(null);
  const cab = useRef<HTMLDivElement>(null);
  const reelsBox = useRef<HTMLDivElement>(null);
  const reelEls = useRef<(HTMLDivElement | null)[]>([]);
  const cellEls = useRef<(HTMLDivElement | null)[][]>(Array.from({ length: REELS }, () => []));
  const winMeter = useRef<HTMLSpanElement>(null);
  const creditMeter = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const reels = useRef<Reel[]>([]);
  const fx = useRef<Fx | null>(null);
  const [fxReady, setFxReady] = useState<Fx | null>(null);
  const raf = useRef(0);
  const hum = useRef<ReturnType<typeof sound.reelHum> | null>(null);
  const busy = useRef(false);
  const presenting = useRef<(() => void) | null>(null);
  const timers = useRef<number[]>([]);
  const lastGrid = useRef<SlotSymbol[][] | null>(null);
  const credit = useRef<number | null>(null);
  const audible = useRef(sfx.audible);
  const bigDone = useRef<() => void>(() => {});

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // Звук: контекст заводится сразу — иначе первый клик только разблокирует
  // его, и пуск первого спина прозвучал бы молча.
  useEffect(() => {
    audioContext();
  }, []);
  useEffect(() => {
    sound.setVolume(sfx.gain);
  }, [sfx.gain]);

  // Барабаны и холст частиц — после монтирования: им нужны узлы.
  useLayoutEffect(() => {
    const grid = randomGrid();
    lastGrid.current = grid;
    reels.current = cellEls.current.map(
      (cells, i) => new Reel(cells.filter(Boolean) as HTMLDivElement[], () => fillerSymbol(), grid[i]),
    );
    const f = new Fx(canvas.current!);
    f.scale = reducedMotion() ? 0.3 : 1;
    fx.current = f;
    setFxReady(f);
    const resize = () => f.resize();
    window.addEventListener('resize', resize);
    const pending = timers.current;
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf.current);
      pending.forEach(clearTimeout);
      hum.current?.stop();
      f.dispose();
    };
  }, []);

  // Показ кредита: пока спин идёт — своё число (ставка уже ушла, выигрыш ещё
  // считается), иначе — баланс с сервера.
  useEffect(() => {
    if (credit.current === null && creditMeter.current && balance !== null)
      creditMeter.current.textContent = fmt(balance);
  }, [balance]);

  const setCredit = (n: number | null) => {
    credit.current = n;
    if (creditMeter.current) creditMeter.current.textContent = fmt(n ?? balance ?? 0);
  };

  const loop = useCallback(() => {
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      let moving = 0;
      for (const r of reels.current) if (r.tick(now, dt)) moving++;
      hum.current?.set(moving);
      if (moving) raf.current = requestAnimationFrame(step);
      else {
        raf.current = 0;
        hum.current?.stop();
        hum.current = null;
      }
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);
  }, []);

  /** Снять подсветку прошлого выигрыша. */
  const clearWin = () => {
    reelsBox.current?.removeAttribute('data-dim');
    for (const cells of cellEls.current) for (const c of cells) c?.classList.remove('is-win', 'is-scatter');
    setShown(null);
    setTier('none');
    setCycling(false);
    if (winMeter.current) winMeter.current.textContent = '0';
  };

  const finish = (res: SlotsSpin | null) => {
    presenting.current = null;
    busy.current = false;
    setPhase('idle');
    setCycling(true);
    setCredit(null);
    if (res && winMeter.current) winMeter.current.textContent = fmt(res.win);
    void qc.invalidateQueries({ queryKey: ['coins'] });
    if (autoRef.current) later(() => autoRef.current && spinRef.current(), turboRef.current ? 250 : 700);
  };

  /** Показ итога: подсветка, линии, частицы, счёт. */
  const present = (res: SlotsSpin) => {
    const tr = tierOf(res.win, res.bet);
    lastGrid.current = res.grid;
    if (tr === 'none') {
      finish(null);
      return;
    }
    setPhase('present');
    setShown(res);
    setTier(tr);
    const f = fx.current;
    const box = reelsBox.current;
    box?.setAttribute('data-dim', '');

    const cells = new Map<string, HTMLElement>();
    for (const w of res.lines) {
      const rows = config.paylines[w.line];
      for (let r = 0; r < w.count; r++) {
        const el = reels.current[r].cellAt(rows[r]);
        if (el) cells.set(`${r}:${rows[r]}`, el);
      }
    }
    if (res.scatterWin > 0) {
      res.grid.forEach((col, r) =>
        col.forEach((s, row) => {
          if (s !== 'scatter') return;
          const el = reels.current[r].cellAt(row);
          if (el) {
            el.classList.add('is-scatter');
            cells.set(`${r}:${row}`, el);
          }
        }),
      );
    }
    let i = 0;
    for (const el of cells.values()) {
      el.classList.add('is-win');
      const c = centerOf(el);
      const delay = i++ * 60;
      later(() => {
        f?.ring(c.x, c.y, c.w * 0.6);
        f?.burst(c.x, c.y, tr === 'small' ? 6 : 12, 260);
      }, delay);
    }

    if (sfx.audible) sound.winChime({ none: 0, small: 3, nice: 5, big: 6, mega: 7, epic: 8 }[tr]);
    const meter = winMeter.current;
    if (meter && f) {
      const m = centerOf(meter);
      const n = { none: 0, small: 8, nice: 26, big: 50, mega: 70, epic: 90 }[tr];
      f.fountain(m.x, m.y, n, tr === 'small' ? 0.7 : 1);
    }
    if (tr === 'big' || tr === 'mega' || tr === 'epic') {
      if (!reducedMotion()) kick(cab.current, 'data-shake');
      kick(page.current, 'data-flash');
    }

    // Счёт выигрыша и кредита — вместе: монеты переливаются из одного в другое.
    const dur = countMs(tr) * (turboRef.current ? 0.5 : 1);
    const from = credit.current ?? 0;
    const t0 = performance.now();
    let lastTick = 0;
    let stopped = false;
    const done = () => {
      if (stopped) return;
      stopped = true;
      if (meter) meter.textContent = fmt(res.win);
      setCredit(from + res.win);
    };
    const step = (now: number) => {
      if (stopped) return;
      const u = Math.min(1, (now - t0) / dur);
      const e = 1 - (1 - u) ** 2;
      if (meter) meter.textContent = fmt(res.win * e);
      if (creditMeter.current) creditMeter.current.textContent = fmt(from + res.win * e);
      if (now - lastTick > 75 && u < 1) {
        lastTick = now;
        if (audible.current) sound.countTick(u);
        if (audible.current && Math.random() < 0.4) sound.coin();
      }
      if (u < 1) requestAnimationFrame(step);
      else done();
    };
    const isBig = tr === 'big' || tr === 'mega' || tr === 'epic';
    if (!isBig) requestAnimationFrame(step);

    // Крупный — свой экран со своим счётом; автомат ждёт, пока его закроют.
    if (isBig) later(() => setBig({ tier: tr as BigTier, win: res.win }), 450);
    else later(() => presenting.current === skip && finish(res), dur + 250);

    const skip = () => {
      done();
      finish(res);
    };
    presenting.current = skip;
    if (isBig) bigDone.current = () => {
      done();
      setBig(null);
      finish(res);
    };
  };

  const onLand = (i: number, res: SlotsSpin, plan: StopPlan) => {
    if (audible.current) sound.reelStop(i);
    const reel = reelEls.current[i];
    kick(reel, 'data-land');
    const scattersSoFar = res.grid.slice(0, i + 1).flat().filter((s) => s === 'scatter').length;
    const here = res.grid[i].filter((s) => s === 'scatter').length;
    if (here > 0) {
      if (audible.current) sound.scatterLand(scattersSoFar);
      res.grid[i].forEach((s, row) => {
        if (s !== 'scatter') return;
        const el = reels.current[i].cellAt(row);
        if (!el) return;
        kick(el, 'data-pop');
        const c = centerOf(el);
        fx.current?.burst(c.x, c.y, 16, 320);
      });
    }
    if (i < REELS - 1 && plan.hot[i + 1]) {
      setHot(i + 1);
      if (audible.current) sound.tease(plan.at[i + 1] - plan.at[i]);
    } else if (i < REELS - 1) setHot(-1);
    if (i === REELS - 1) {
      setHot(-1);
      later(() => present(res), 300);
    }
  };

  /** Спин. Во время спина — ускорить остановку, во время показа — досчитать и крутить снова. */
  const doSpin = () => {
    if (big) return;
    if (busy.current) {
      if (presenting.current) presenting.current();
      else {
        const now = performance.now();
        reels.current.forEach((r) => r.hurry(now));
        return;
      }
    }
    if (balance !== null && balance < bet) {
      setError(t('noCoins'));
      setAuto(false);
      return;
    }
    busy.current = true;
    setError(null);
    clearWin();
    setPhase('spinning');
    setPulled((n) => n + 1);
    setCredit((credit.current ?? balance ?? 0) - bet);
    if (audible.current) {
      sound.spinStart();
      hum.current?.stop();
      hum.current = sound.reelHum();
    }
    const t0 = performance.now();
    const speed = turboRef.current ? 34 : 24;
    reels.current.forEach((r, i) => r.start(t0 + i * (turboRef.current ? 20 : 55), speed));
    loop();

    const minSpin = turboRef.current ? 380 : 950;
    spinReq.mutateAsync(bet).then(
      (res) => {
        const plan = stopPlan(res.grid, turboRef.current);
        const base = Math.max(performance.now() + 60, t0 + minSpin);
        reels.current.forEach((r, i) => {
          r.onLand = () => onLand(i, res, plan);
          r.stop(res.grid[i], base + plan.at[i]);
        });
      },
      (e: unknown) => {
        // Спин не принят — барабаны встают на прежнее поле, ставка не ушла.
        const grid = lastGrid.current ?? randomGrid();
        const base = Math.max(performance.now(), t0 + 300);
        reels.current.forEach((r, i) => {
          r.onLand = i === REELS - 1 ? () => finish(null) : null;
          r.stop(grid[i], base + i * 80);
        });
        setError(e instanceof Error ? e.message : t('failed'));
        setAuto(false);
      },
    );
  };

  // Свежие значения для колбэков таймеров и клавиш: замыкание спина живёт
  // дольше рендера, в котором его создали.
  const spinRef = useRef(doSpin);
  const autoRef = useRef(auto);
  const turboRef = useRef(turbo);
  useLayoutEffect(() => {
    spinRef.current = doSpin;
    autoRef.current = auto;
    turboRef.current = turbo;
    audible.current = sfx.audible;
  });

  // Автоспин: включили в покое — первый спин сразу.
  useEffect(() => {
    if (auto && !busy.current) spinRef.current();
  }, [auto]);

  // Пробел — спин, как кнопка на панели автомата.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName))) return;
      e.preventDefault();
      spinRef.current();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const spinning = phase === 'spinning';
  const changeBet = (d: number) => {
    if (busy.current) return;
    setBetIdx((i) => Math.max(0, Math.min(config.bets.length - 1, i + d)));
  };

  const winLines = shown?.lines ?? [];
  const winSet = new Set(winLines.map((w) => w.line));
  const message = error
    ? error
    : shown && shown.win > 0
      ? shown.scatterWin > 0
        ? t('bonus', { n: shown.scatters })
        : winLines.length === 1
          ? t('lineWin', { line: winLines[0].line + 1, n: winLines[0].count })
          : t('linesWin', { n: winLines.length })
      : spinning
        ? t('goodLuck')
        : t('placeBet');

  return (
    <div className="sl-page" ref={page} data-mode={big ? 'big' : phase === 'present' ? 'win' : phase} data-tier={tier}>
      <div className="sl-room" aria-hidden>
        <div className="sl-bokeh" />
        <div className="sl-bokeh sl-bokeh-2" />
        <div className="sl-spot" />
      </div>

      <header className="sl-top">
        <Link href="/games" className="sl-back">
          ← {t('back')}
        </Link>
        <div className="sl-top-r">
          <button type="button" className="sl-chip-btn" onClick={() => setPaytable(true)}>
            {t('paytable')}
          </button>
          <AudioControl kind="sound" channel={sfx} />
        </div>
      </header>

      <div className="sl-stage">
        <div className="sl-cab" ref={cab}>
          {/* ── Вывеска ── */}
          <div className="sl-marquee">
            <div className="sl-bulbs" aria-hidden>
              {Array.from({ length: BULBS }, (_, i) => (
                <span key={i} className="sl-bulb" style={{ ['--i' as string]: i }} />
              ))}
            </div>
            <div className="sl-logo" data-text="LUCKY SEVENS">
              LUCKY SEVENS
            </div>
            <div className="sl-sub">{t('subtitle')}</div>
            <div className="sl-bulbs sl-bulbs-b" aria-hidden>
              {Array.from({ length: BULBS }, (_, i) => (
                <span key={i} className="sl-bulb" style={{ ['--i' as string]: BULBS - i }} />
              ))}
            </div>
          </div>

          {/* ── Окно барабанов ── */}
          <div className="sl-window">
            <LineBadges
              side="l"
              wins={winSet}
              onHover={setPreview}
              ids={[1, 3, 5, 7, 9, 0, 8, 6, 4, 2]}
            />
            <div className="sl-reels" ref={reelsBox}>
              {Array.from({ length: REELS }, (_, i) => (
                <div
                  key={i}
                  className="sl-reel"
                  ref={(el) => {
                    reelEls.current[i] = el;
                  }}
                  data-hot={hot === i ? '' : undefined}
                >
                  {Array.from({ length: POOL }, (_, k) => (
                    <div
                      key={k}
                      className="sl-cell"
                      ref={(el) => {
                        cellEls.current[i][k] = el;
                      }}
                    >
                      <svg viewBox="0 0 100 100" aria-hidden>
                        <use />
                      </svg>
                    </div>
                  ))}
                  <div className="sl-hotframe" aria-hidden />
                </div>
              ))}
              <div className="sl-cyl" aria-hidden />
              <WinLines key={shown?.id ?? 'none'} paylines={config.paylines} wins={winLines} cycling={cycling} preview={preview} />
              <div className="sl-glass" aria-hidden />
            </div>
            <LineBadges
              side="r"
              wins={winSet}
              onHover={setPreview}
              ids={[1, 3, 5, 7, 9, 0, 8, 6, 4, 2]}
            />
          </div>

          {/* ── Табло ── */}
          <div className={cn('sl-msg', error && 'sl-msg-err')} aria-live="polite">
            {message}
          </div>
          <div className="sl-meters">
            <Meter label={t('credit')}>
              <span ref={creditMeter}>{balance === null ? '—' : fmt(balance)}</span>
            </Meter>
            <Meter label={t('bet')}>{fmt(bet)}</Meter>
            <Meter label={t('win')} hot={tier !== 'none'}>
              <span ref={winMeter}>0</span>
            </Meter>
          </div>

          {/* ── Пульт ── */}
          <div className="sl-deck">
            <div className="sl-bet">
              <button
                type="button"
                className="sl-key"
                onClick={() => changeBet(-1)}
                disabled={phase !== 'idle' || betIdx === 0}
                aria-label={t('betDown')}
              >
                −
              </button>
              <div className="sl-bet-v">
                <small>{t('bet')}</small>
                <b>
                  {fmt(bet)}
                  <CoinIcon className="sl-coin-i" />
                </b>
              </div>
              <button
                type="button"
                className="sl-key"
                onClick={() => changeBet(1)}
                disabled={phase !== 'idle' || betIdx === config.bets.length - 1}
                aria-label={t('betUp')}
              >
                +
              </button>
              <button
                type="button"
                className="sl-key sl-key-wide"
                onClick={() => !busy.current && setBetIdx(config.bets.length - 1)}
                disabled={phase !== 'idle'}
              >
                {t('maxBet')}
              </button>
            </div>

            <button
              type="button"
              className="sl-spin"
              data-state={spinning ? 'stop' : 'spin'}
              onClick={() => spinRef.current()}
              aria-label={spinning ? t('stop') : t('spin')}
            >
              <span className="sl-spin-ring" aria-hidden />
              <span className="sl-spin-face">
                <svg viewBox="0 0 24 24" aria-hidden className="sl-spin-ico">
                  <path d="M12 4a8 8 0 1 1-7.4 5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                  <path d="M3 4l1.6 5L9.4 7.4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{spinning ? t('stop') : t('spin')}</span>
              </span>
            </button>

            <div className="sl-toggles">
              <button type="button" className="sl-lamp" data-on={auto ? '' : undefined} onClick={() => setAuto((v) => !v)}>
                {t('auto')}
              </button>
              <button type="button" className="sl-lamp" data-on={turbo ? '' : undefined} onClick={() => setTurbo((v) => !v)}>
                {t('turbo')}
              </button>
            </div>
          </div>
          <p className="sl-legal">{t('legal')}</p>
        </div>

        {/* ── Рычаг ── */}
        <button
          type="button"
          className="sl-lever"
          key={pulled}
          data-pulled={pulled > 0 ? '' : undefined}
          onClick={() => spinRef.current()}
          aria-label={t('spin')}
        >
          <span className="sl-lever-base" />
          <span className="sl-lever-arm">
            <span className="sl-lever-ball" />
          </span>
        </button>
      </div>

      <canvas className="sl-fx" ref={canvas} aria-hidden />
      {big && (
        <BigWin
          tier={big.tier}
          win={big.win}
          fx={fxReady}
          audible={sfx.audible}
          onDone={() => bigDone.current()}
        />
      )}
      {paytable && <Paytable config={config} bet={bet} onClose={() => setPaytable(false)} />}
    </div>
  );
}

function Meter({ label, hot, children }: { label: string; hot?: boolean; children: React.ReactNode }) {
  return (
    <div className="sl-meter" data-hot={hot ? '' : undefined}>
      <small>{label}</small>
      <b>{children}</b>
    </div>
  );
}

/** Значки линий по краям окна: горят у выигравших, под курсором показывают линию. */
function LineBadges({
  side,
  ids,
  wins,
  onHover,
}: {
  side: 'l' | 'r';
  ids: number[];
  wins: Set<number>;
  onHover: (line: number | null) => void;
}) {
  return (
    <div className={`sl-badges sl-badges-${side}`}>
      {ids.map((line) => (
        <span
          key={line}
          className="sl-badge"
          data-on={wins.has(line) ? '' : undefined}
          style={{ ['--c' as string]: LINE_COLORS[line] }}
          onMouseEnter={() => onHover(line)}
          onMouseLeave={() => onHover(null)}
        >
          {line + 1}
        </span>
      ))}
    </div>
  );
}
