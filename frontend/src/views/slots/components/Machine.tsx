'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCoinBalance } from '@/entities/coins';
import {
  useSlotsSpin,
  type SlotsBonus,
  type SlotsConfig,
  type SlotsLineWin,
  type SlotsSpin,
  type SlotSymbol,
} from '@/entities/slots';
import { audioContext } from '@/shared/lib/sound/player';
import { useAudioChannel } from '@/shared/lib/sound/useAudioChannel';
import { cn } from '@/shared/lib/utils/css';
import { AudioControl } from '@/shared/ui/AudioControl';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { Fx } from '../lib/fx';
import { countMs, fillerSymbol, isBigTier, randomGrid, stopPlan, tierOf, type StopPlan, type WinTier } from '../lib/plan';
import { buzz } from '../lib/haptics';
import { Reel } from '../lib/reel';
import * as sound from '../lib/sound';
import { useSlotsMusic } from '../model/useSlotsMusic';
import { BigWin } from './BigWin';
import { BonusSplash, type Splash } from './BonusSplash';
import { Paytable } from './Paytable';
import { PickBonus } from './PickBonus';
import { WheelBonus } from './WheelBonus';
import { ChartBackdrop } from './ChartBackdrop';
import { SpinHistory } from './SpinHistory';
import { Ticker } from './Ticker';
import { LINE_COLORS, WinLines } from './WinLines';

const REELS = 5;
const POOL = 5;
const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

type Phase = 'idle' | 'spinning' | 'present' | 'bonus';
/** Бесплатные спины идут: осталось, сыграно, выигрыш бонуса. */
type FreeState = { left: number; played: number; total: number; win: number; mult: number };
/** Окно сундуков или колеса и обещание, которое оно закрывает. */
type Overlay = { bonus: Extract<SlotsBonus, { kind: 'pick' | 'wheel' }>; done: () => void };
const SPECIAL: SlotSymbol[] = ['scatter', 'chest', 'wheel'];

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
 * Спин — цепочка шагов с обещаниями: барабаны встали → показ выигрыша →
 * бонусы по очереди (бесплатные спины крутят те же барабаны по полям из
 * ответа, сундуки и колесо — свои окна) → итог. Все суммы уже начислены
 * сервером одной транзакцией; экран их только досчитывает.
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
  const mus = useAudioChannel('virex.slots.music', 0.6);

  const [betIdx, setBetIdx] = useState(0);
  const [turbo, setTurbo] = useState(false);
  const [auto, setAuto] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [hot, setHot] = useState(-1);
  const [shown, setShown] = useState<{ id: number; lines: SlotsLineWin[]; text: string } | null>(null);
  const [splash, setSplash] = useState<Splash | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [free, setFree] = useState<FreeState | null>(null);
  const [bonusTone, setBonusTone] = useState<'free' | 'pick' | 'wheel' | null>(null);
  const [tier, setTier] = useState<WinTier>('none');
  const [cycling, setCycling] = useState(false);
  const [big, setBig] = useState<{ win: number } | null>(null);
  // Музыка бонуса вступает с его заставкой, а не после неё: заставка и есть вход.
  useSlotsMusic(mus, bonusTone ?? (splash?.kind === 'intro' ? splash.tone : null) ?? 'base', big !== null);
  /** «+N» над последним символом каждой выигравшей линии. */
  const [pops, setPops] = useState<{ id: string; x: number; y: number; text: string; color: string; delay: number }[]>([]);
  /** Молния через символы бонуса, в процентах окна барабанов. */
  const [bolt, setBolt] = useState<{ x: number; y: number }[] | null>(null);
  /** Выигрышных спинов подряд (в плюс). Только зрелище: на выплаты не влияет. */
  const [streak, setStreak] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [paytable, setPaytable] = useState(false);
  /** История спинов сессии — таблица под графиком и лента котировок. */
  const [history, setHistory] = useState<{ id: string; at: number; bet: number; win: number; bonus: string }[]>([]);

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
  /** Выигрыш спина, накопленный на табло: базовый и все бонусы. */
  const won = useRef(0);
  const streakRef = useRef(0);
  const shownId = useRef(0);
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

  const wait = (ms: number) => new Promise<void>((r) => later(r, ms));
  const showSplash = (sp: Omit<Splash, 'onDone'>) =>
    new Promise<void>((r) =>
      setSplash({
        ...sp,
        onDone: () => {
          setSplash(null);
          r();
        },
      }),
    );

  /** Снять подсветку прошлого выигрыша. */
  const clearWin = () => {
    reelsBox.current?.removeAttribute('data-dim');
    for (const cells of cellEls.current)
      for (const c of cells) {
        c?.classList.remove('is-win', 'is-scatter');
        c?.style.removeProperty('--d');
      }
    setShown(null);
    setPops([]);
    setBolt(null);
    setTier('none');
    setCycling(false);
  };

  /** Досчитать `amount` на табло выигрыша и кредита за `ms`. Пропуск — сразу до конца. */
  const countUp = (amount: number, ms: number) =>
    new Promise<void>((resolve) => {
      const meter = winMeter.current;
      const from = credit.current ?? 0;
      const wonFrom = won.current;
      won.current += amount;
      credit.current = from + amount;
      const t0 = performance.now();
      let lastTick = 0;
      let stopped = false;
      const done = () => {
        if (stopped) return;
        stopped = true;
        if (meter) meter.textContent = fmt(won.current);
        if (creditMeter.current) creditMeter.current.textContent = fmt(from + amount);
        presenting.current = null;
        resolve();
      };
      presenting.current = done;
      const step = (now: number) => {
        if (stopped) return;
        const u = ms > 0 ? Math.min(1, (now - t0) / ms) : 1;
        const e = 1 - (1 - u) ** 2;
        if (meter) meter.textContent = fmt(wonFrom + amount * e);
        if (creditMeter.current) creditMeter.current.textContent = fmt(from + amount * e);
        if (now - lastTick > 75 && u < 1) {
          lastTick = now;
          if (audible.current) sound.countTick(u);
          if (audible.current && Math.random() < 0.4) sound.coin();
        }
        if (u < 1) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });

  /**
   * Показ выигрыша поля: подсветка линий и символов бонуса, частицы, счёт.
   * Крупный — ещё и свой экран. Без выигрыша и без бонуса — сразу.
   */
  const presentWin = async (grid: SlotSymbol[][], lines: SlotsLineWin[], win: number, triggers: SlotSymbol[]) => {
    const tr = tierOf(win, bet);
    if (tr === 'none' && !triggers.length) return;
    setTier(tr);
    const f = fx.current;
    reelsBox.current?.setAttribute('data-dim', '');

    const cells = new Map<string, HTMLElement>();
    for (const w of lines) {
      const rows = config.paylines[w.line];
      for (let r = 0; r < w.count; r++) {
        const el = reels.current[r].cellAt(rows[r]);
        if (el) cells.set(`${r}:${rows[r]}`, el);
      }
    }
    grid.forEach((col, r) =>
      col.forEach((s, row) => {
        if (!triggers.includes(s)) return;
        const el = reels.current[r].cellAt(row);
        if (!el) return;
        el.classList.add('is-scatter');
        cells.set(`${r}:${row}`, el);
      }),
    );
    // Символы «оживают» по очереди слева направо, каждый со своим звоном выше
    // прежнего; мелкий выигрыш (меньше ставки) — без звона и частиц.
    const quiet = tr === 'tiny' || tr === 'none';
    const ordered = [...cells.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, el]) => el);
    ordered.forEach((el, k) => {
      el.style.setProperty('--d', `${k * 90}ms`);
      el.classList.add('is-win');
      if (quiet) return;
      const c = centerOf(el);
      later(() => {
        f?.ring(c.x, c.y, c.w * 0.6);
        f?.burst(c.x, c.y, tr === 'small' ? 8 : 14, 280);
        if (audible.current) sound.cellDing(k);
      }, k * 90);
    });
    if (!quiet) {
      setPops(
        lines.map((w, k) => {
          const rows = config.paylines[w.line];
          return {
            id: `${shownId.current}:${w.line}`,
            x: ((w.count - 0.5) / REELS) * 100,
            y: ((rows[w.count - 1] + 0.5) / 3) * 100,
            text: `+${fmt(w.win)}`,
            color: LINE_COLORS[w.line],
            delay: 250 + k * 140,
          };
        }),
      );
      kick(cab.current, 'data-sweep');
      buzz(tr === 'small' ? 30 : [40, 30, 60]);
    }
    if (triggers.length) {
      // Молния через символы бонуса: по одному на барабан, слева направо.
      const pts: { x: number; y: number }[] = [];
      grid.forEach((col, r) => {
        const row = col.findIndex((s) => triggers.includes(s));
        if (row >= 0) pts.push({ x: ((r + 0.5) / REELS) * 100, y: ((row + 0.5) / 3) * 100 });
      });
      setBolt(pts);
      if (audible.current) sound.thunder();
      kick(cab.current, 'data-zoom');
      buzz([80, 40, 80, 40, 160]);
    }
    const id = ++shownId.current;
    setShown({
      id,
      lines,
      text:
        lines.length === 0
          ? ''
          : lines.length === 1
            ? t('lineWin', { line: lines[0].line + 1, n: lines[0].count })
            : t('linesWin', { n: lines.length }),
    });

    if (tr === 'none') {
      if (audible.current) sound.bonusStart();
      kick(page.current, 'data-flash');
      await wait(1700);
      return;
    }
    if (tr === 'tiny') {
      await countUp(win, countMs(tr));
      if (triggers.length) await wait(1200);
      return;
    }
    setPhase((p) => (p === 'bonus' ? p : 'present'));
    if (audible.current) sound.winChime({ none: 0, tiny: 0, small: 3, nice: 5, big: 6, mega: 7, epic: 8, legendary: 8 }[tr]);
    const meter = winMeter.current;
    if (meter && f) {
      const m = centerOf(meter);
      f.fountain(m.x, m.y, { none: 0, tiny: 0, small: 10, nice: 30, big: 50, mega: 70, epic: 90, legendary: 110 }[tr], tr === 'small' ? 0.7 : 1);
    }
    if (isBigTier(tr)) {
      if (!reducedMotion()) kick(cab.current, 'data-shake');
      kick(page.current, 'data-flash');
      await wait(450);
      await new Promise<void>((r) => {
        bigDone.current = () => {
          setBig(null);
          r();
        };
        setBig({ win });
      });
      await countUp(win, 0);
      return;
    }
    await countUp(win, countMs(tr) * (turboRef.current ? 0.5 : 1));
    if (triggers.length) await wait(1100);
  };

  /** Символы бонусов, что сработали на этом поле. */
  const triggersOf = (grid: SlotSymbol[][], scatters: number): SlotSymbol[] => {
    const on = (s: SlotSymbol) => [0, 2, 4].every((r) => grid[r].includes(s));
    return [...(scatters >= 3 ? (['scatter'] as const) : []), ...(on('chest') ? (['chest'] as const) : []), ...(on('wheel') ? (['wheel'] as const) : [])];
  };

  const onLand = (i: number, grid: SlotSymbol[][], plan: StopPlan, landed: () => void) => {
    if (audible.current) sound.reelStop(i);
    const reelEl = reelEls.current[i];
    kick(reelEl, 'data-land');
    buzz(12);
    if (reelEl) {
      // Искры из-под барабана — удар об упор.
      const r = reelEl.getBoundingClientRect();
      fx.current?.burst(r.left + r.width / 2, r.bottom - 4, 5, 180);
    }
    for (const sym of SPECIAL) {
      const here = grid[i].filter((s) => s === sym).length;
      if (!here) continue;
      // Сундук и колесо считаются только на барабанах 1, 3 и 5.
      if (sym !== 'scatter' && i % 2) continue;
      const soFar = grid
        .slice(0, i + 1)
        .filter((_, r) => sym === 'scatter' || r % 2 === 0)
        .flat()
        .filter((s) => s === sym).length;
      if (audible.current) sound.scatterLand(soFar);
      grid[i].forEach((s, row) => {
        if (s !== sym) return;
        const el = reels.current[i].cellAt(row);
        if (!el) return;
        kick(el, 'data-pop');
        const c = centerOf(el);
        fx.current?.burst(c.x, c.y, 16, 320);
      });
    }
    if (i < REELS - 1 && plan.hot[i + 1]) {
      setHot(i + 1);
      if (audible.current) {
        sound.tease(plan.at[i + 1] - plan.at[i]);
        sound.heartbeat(plan.at[i + 1] - plan.at[i]);
      }
    } else if (i < REELS - 1) setHot(-1);
    if (i === REELS - 1) {
      setHot(-1);
      later(landed, 300);
    }
  };

  const startReels = () => {
    if (audible.current) {
      sound.spinStart();
      hum.current?.stop();
      hum.current = sound.reelHum();
    }
    const t0 = performance.now();
    const speed = turboRef.current ? 34 : 24;
    reels.current.forEach((r, i) => r.start(t0 + i * (turboRef.current ? 20 : 55), speed));
    loop();
    return t0;
  };

  const stopReels = (grid: SlotSymbol[][], notBefore: number) =>
    new Promise<void>((resolve) => {
      const plan = stopPlan(grid, turboRef.current);
      const base = Math.max(performance.now() + 60, notBefore);
      reels.current.forEach((r, i) => {
        r.onLand = () => onLand(i, grid, plan, resolve);
        r.stop(grid[i], base + plan.at[i]);
      });
    });

  /** Бесплатные спины: те же барабаны по полям из ответа, свой свет и счётчик. */
  const playFree = async (b: Extract<SlotsBonus, { kind: 'free' }>) => {
    if (audible.current) sound.bonusStart();
    await showSplash({
      kind: 'intro',
      tone: 'free',
      title: t('free.title'),
      sub: t('free.sub', { n: b.awarded, x: b.mult }),
      autoMs: autoRef.current ? 2400 : 7000,
    });
    setBonusTone('free');
    let left = b.awarded;
    let total = b.awarded;
    let bonusWin = 0;
    setFree({ left, played: 0, total, win: 0, mult: b.mult });
    for (const [k, s] of b.spins.entries()) {
      clearWin();
      left--;
      setFree({ left, played: k + 1, total, win: bonusWin, mult: b.mult });
      const t0 = startReels();
      await stopReels(s.grid, t0 + (turboRef.current ? 320 : 650));
      lastGrid.current = s.grid;
      await presentWin(s.grid, s.lines, s.win, s.added ? ['scatter'] : []);
      bonusWin += s.win;
      if (s.added) {
        left += s.added;
        total += s.added;
        setSplash({ kind: 'toast', tone: 'free', title: t('free.more', { n: s.added }), autoMs: 1800, onDone: () => setSplash(null) });
      }
      setFree({ left, played: k + 1, total, win: bonusWin, mult: b.mult });
      await wait(turboRef.current ? 150 : 450);
    }
    clearWin();
    await showSplash({
      kind: 'total',
      tone: 'free',
      title: t('free.total'),
      sub: t('free.played', { n: b.spins.length }),
      amount: b.win,
      autoMs: autoRef.current ? 3000 : 8000,
    });
    setFree(null);
    setBonusTone(null);
  };

  /** Сундуки и колесо: заставка, своё окно, потом сумма на табло. */
  const playOverlay = async (b: Extract<SlotsBonus, { kind: 'pick' | 'wheel' }>) => {
    if (audible.current) sound.bonusStart();
    await showSplash({
      kind: 'intro',
      tone: b.kind,
      title: t(`${b.kind}.title`),
      sub: t(`${b.kind}.sub`),
      autoMs: autoRef.current ? 2200 : 7000,
    });
    setBonusTone(b.kind);
    await new Promise<void>((r) =>
      setOverlay({
        bonus: b,
        done: () => {
          setOverlay(null);
          r();
        },
      }),
    );
    setBonusTone(null);
    await countUp(b.win, 900);
  };

  const finish = () => {
    presenting.current = null;
    busy.current = false;
    setPhase('idle');
    setCycling(true);
    setCredit(null);
    void qc.invalidateQueries({ queryKey: ['coins'] });
    if (autoRef.current) later(() => autoRef.current && spinRef.current(), turboRef.current ? 250 : 700);
  };

  const run = async (res: SlotsSpin, t0: number) => {
    await stopReels(res.grid, t0 + (turboRef.current ? 380 : 950));
    lastGrid.current = res.grid;
    await presentWin(res.grid, res.lines, res.baseWin, triggersOf(res.grid, res.scatters));
    if (res.bonuses.length) setPhase('bonus');
    for (const b of res.bonuses) {
      if (b.kind === 'free') await playFree(b);
      else await playOverlay(b);
    }
    if (res.bonuses.length && winMeter.current) winMeter.current.textContent = fmt(res.win);
    setHistory((h) =>
      [
        { id: res.id, at: Date.now(), bet: res.bet, win: res.win, bonus: res.bonuses.map((b) => b.kind).join(' ') },
        ...h,
      ].slice(0, 40),
    );
    const next = res.win > res.bet ? streakRef.current + 1 : 0;
    streakRef.current = next;
    setStreak(next);
    if (next >= 2) {
      if (audible.current) sound.winChime(Math.min(8, 2 + next));
      setSplash({ kind: 'toast', tone: 'wheel', title: t('streak', { n: next }), autoMs: 1800, onDone: () => setSplash(null) });
    }
    finish();
  };

  /** Спин. Во время спина — ускорить остановку, во время счёта — досчитать сразу. */
  const doSpin = () => {
    // Плашка «+N спинов» / «Серия» — только надпись поверх: спин она не держит
    // (иначе и автоспин вставал бы, пока она видна).
    if (big || overlay || (splash && splash.kind !== 'toast')) return;
    if (busy.current) {
      if (presenting.current) presenting.current();
      else if (phase === 'spinning') {
        const now = performance.now();
        reels.current.forEach((r) => r.hurry(now));
      }
      return;
    }
    if (balance !== null && balance < bet) {
      setError(t('noCoins'));
      setAuto(false);
      return;
    }
    busy.current = true;
    setError(null);
    clearWin();
    won.current = 0;
    if (winMeter.current) winMeter.current.textContent = '0';
    setPhase('spinning');
    setCredit((credit.current ?? balance ?? 0) - bet);
    const t0 = startReels();
    spinReq.mutateAsync(bet).then(
      (res) => void run(res, t0),
      (e: unknown) => {
        // Спин не принят — барабаны встают на прежнее поле, ставка не ушла.
        const grid = lastGrid.current ?? randomGrid();
        void stopReels(grid, t0 + 300).then(finish);
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
    : free
      ? t('free.counter', { n: free.played, total: free.total, x: free.mult })
      : shown?.text
        ? shown.text
        : spinning
          ? t('goodLuck')
          : t('placeBet');

  const pnl = history.reduce((sum, h) => sum + h.win - h.bet, 0);
  const lastWin = history[0] ? history[0].win : null;
  const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;

  return (
    <div
      className="sl-page"
      ref={page}
      data-mode={big ? 'big' : phase === 'present' ? 'win' : phase}
      data-tier={tier}
      data-bonus={bonusTone ?? undefined}
      data-tease={hot >= 0 ? '' : undefined}
      data-streak={streak >= 3 ? '' : undefined}
    >
      <div className="sl-room" aria-hidden />

      <div className="sl-term" ref={cab}>
        <Ticker config={config} last={history.slice(0, 8)} />

        {/* ── Пара и статистика сессии — шапка графика ── */}
        <header className="sl-pair">
          <Link href="/games" className="sl-back" aria-label={t('back')}>
            ←
          </Link>
          <div className="sl-pair-name">
            <svg viewBox="0 0 100 100" aria-hidden className="sl-pair-ico">
              <use href="#sl-s-diamond" />
            </svg>
            <div>
              <b>BTC/MOON</b>
              <small>{free ? t('free.left', { n: free.left, win: fmt(free.win) }) : t('subtitle')}</small>
            </div>
          </div>
          <dl className="sl-stats">
            <div>
              <dt>{t('stat.last')}</dt>
              <dd className={lastWin === null ? '' : lastWin > (history[0]?.bet ?? 0) ? 'up' : 'down'}>
                {lastWin === null ? '—' : fmt(lastWin)}
              </dd>
            </div>
            <div>
              <dt>{t('stat.pnl')}</dt>
              <dd className={pnl > 0 ? 'up' : pnl < 0 ? 'down' : ''}>{signed(pnl)}</dd>
            </div>
            <div className="sl-stat-hide">
              <dt>{t('stat.spins')}</dt>
              <dd>{history.length}</dd>
            </div>
            <div className="sl-stat-hide">
              <dt>RTP</dt>
              <dd>{config.rtp}%</dd>
            </div>
          </dl>
          <div className="sl-pair-tools">
            {streak >= 2 && (
              <span key={streak} className="sl-streak">
                {t('streakBadge', { n: streak })}
              </span>
            )}
            <button type="button" className="sl-tool" onClick={() => setPaytable(true)}>
              {t('paytable')}
            </button>
            <AudioControl kind="music" channel={mus} />
            <AudioControl kind="sound" channel={sfx} />
          </div>
        </header>

        {/* ── График: барабаны на свечах ── */}
        <section className="sl-chart">
          <div className="sl-window">
            <LineBadges side="l" wins={winSet} onHover={setPreview} ids={[1, 3, 5, 7, 9, 0, 8, 6, 4, 2]} />
            <div className="sl-reels" ref={reelsBox}>
              <ChartBackdrop />
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
              {bolt && (
                <>
                  <svg className="sl-bolt" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                    <polyline points={zigzag(bolt)} className="sl-bolt-glow" />
                    <polyline points={zigzag(bolt)} className="sl-bolt-core" pathLength={1} />
                  </svg>
                  <div className="sl-stamp">{t('bonusStamp')}</div>
                </>
              )}
              {pops.map((p) => (
                <span
                  key={p.id}
                  className="sl-pop"
                  style={{
                    left: `${p.x}%`,
                    top: `${p.y}%`,
                    color: p.color,
                    animationDelay: `${p.delay}ms`,
                  }}
                >
                  {p.text}
                </span>
              ))}
              <WinLines key={shown?.id ?? 0} paylines={config.paylines} wins={winLines} cycling={cycling} preview={preview} />
            </div>
            <LineBadges side="r" wins={winSet} onHover={setPreview} ids={[1, 3, 5, 7, 9, 0, 8, 6, 4, 2]} />
          </div>
          <div className={cn('sl-msg', error && 'sl-msg-err')} aria-live="polite">
            <span className="sl-live" aria-hidden />
            {message}
          </div>
        </section>

        {/* ── Ордер: баланс, размер, кнопка ── */}
        <aside className="sl-order">
          <div className="sl-order-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={!auto} data-on={!auto ? '' : undefined} onClick={() => setAuto(false)}>
              {t('order.manual')}
            </button>
            <button type="button" role="tab" aria-selected={auto} data-on={auto ? '' : undefined} onClick={() => setAuto(true)}>
              {t('order.auto')}
            </button>
          </div>
          <div className="sl-row">
            <span>{t('credit')}</span>
            <b>
              <span ref={creditMeter}>{balance === null ? '—' : fmt(balance)}</span>
              <CoinIcon className="sl-coin-i" />
            </b>
          </div>
          <label className="sl-size">
            <span>{t('bet')}</span>
            <div className="sl-size-box">
              <button type="button" onClick={() => changeBet(-1)} disabled={phase !== 'idle' || betIdx === 0} aria-label={t('betDown')}>
                −
              </button>
              <output>
                {fmt(bet)}
                <CoinIcon className="sl-coin-i" />
              </output>
              <button
                type="button"
                onClick={() => changeBet(1)}
                disabled={phase !== 'idle' || betIdx === config.bets.length - 1}
                aria-label={t('betUp')}
              >
                +
              </button>
            </div>
          </label>
          <div className="sl-chips">
            {config.bets.map((b, i) => (
              <button
                key={b}
                type="button"
                data-on={i === betIdx ? '' : undefined}
                disabled={phase !== 'idle'}
                onClick={() => setBetIdx(i)}
              >
                {i === config.bets.length - 1 ? t('maxBet') : fmt(b)}
              </button>
            ))}
          </div>
          <div className="sl-row sl-row-win" data-hot={tier !== 'none' ? '' : undefined}>
            <span>{t('win')}</span>
            <b>
              <span ref={winMeter}>0</span>
              <CoinIcon className="sl-coin-i" />
            </b>
          </div>
          <label className="sl-check">
            <input type="checkbox" checked={turbo} onChange={(e) => setTurbo(e.target.checked)} />
            <span>{t('turbo')}</span>
          </label>
          <button
            type="button"
            className="sl-spin"
            data-state={spinning ? 'stop' : 'spin'}
            onClick={() => spinRef.current()}
          >
            {spinning ? t('stop') : auto ? t('order.autoGo') : t('spin')}
            <small>{spinning ? t('order.stopHint') : t('order.hint', { n: fmt(bet) })}</small>
          </button>
          <p className="sl-legal">{t('legal')}</p>
        </aside>

        {/* ── История спинов — как история сделок ── */}
        <SpinHistory rows={history} />
      </div>

      <canvas className="sl-fx" ref={canvas} aria-hidden />
      {big && (
        <BigWin
          win={big.win}
          bet={bet}
          fx={fxReady}
          audible={sfx.audible}
          onDone={() => bigDone.current()}
        />
      )}
      {splash && <BonusSplash key={`${splash.kind}:${splash.title}`} splash={splash} />}
      {overlay?.bonus.kind === 'pick' && (
        <PickBonus bonus={overlay.bonus} fx={fxReady} audible={sfx.audible} auto={auto} onDone={overlay.done} />
      )}
      {overlay?.bonus.kind === 'wheel' && (
        <WheelBonus bonus={overlay.bonus} fx={fxReady} audible={sfx.audible} auto={auto} onDone={overlay.done} />
      )}
      {paytable && <Paytable config={config} bet={bet} onClose={() => setPaytable(false)} />}
    </div>
  );
}

/** Ломаная молнии между точками: между соседними — пара изломов в стороны. */
function zigzag(pts: { x: number; y: number }[]) {
  const out: string[] = [];
  pts.forEach((p, i) => {
    out.push(`${p.x},${p.y}`);
    const q = pts[i + 1];
    if (!q) return;
    for (const [u, side] of [
      [0.33, 1],
      [0.66, -1],
    ] as const) {
      out.push(`${p.x + (q.x - p.x) * u + side * 2},${p.y + (q.y - p.y) * u - side * 9}`);
    }
  });
  return out.join(' ');
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
