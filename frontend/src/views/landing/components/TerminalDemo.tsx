'use client';

import { startTransition, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocale } from 'next-intl';
import { Wrap } from '@/shared/ui/Wrap';
import { Terminal, TerminalSkeleton, terminalIntl, timeLabelFormats } from '@/widgets/backtest-session';
import { DEMO_SOURCE, DEMO_SYMBOLS, demoDecimalsOf } from '../lib/demoMarket';
import { useDemoTerminal } from '../model/useDemoTerminal';
import { TerminalHints } from './TerminalHints';

const noop = () => () => undefined;
/** Сколько скролл должен постоять, чтобы поднять терминал, мс. */
const SETTLE = 160;

/**
 * Настоящий терминал продукта — тот же `Terminal`, что у бектеста, турнира и
 * биржи, — на демо-счёте гостя: рынок Binance, позиции в браузере, подсказки
 * при наведении.
 *
 * Поднимается, только когда секция подъезжает к экрану: терминал опрашивает
 * рынок раз в две секунды, и делать это у каждого, кто открыл главную и не
 * долистал, незачем. И только в браузере: счёт читается из его хранилища.
 * Уехав за экран, терминал стоит (`paused`): его часы тикают четыре раза в
 * секунду и перерисовывали бы его, пока листают знак.
 *
 * **Поднимается в паузу прокрутки**, заранее — за полтора экрана: подъём
 * терминала — одна синхронная задача на ~300 мс (замер 2026-10-13, ЦП ×4:
 * рендер виджета и раскладка при вставке, фоновый рендер React её не дробит),
 * и посреди прокрутки она останавливала страницу. Ждём, пока скролл постоит
 * `SETTLE` мс, и отдаём подъём в простой браузера. Не дождались — терминал
 * поднимается, как только въезжает в зону `paused` (600 px до экрана).
 * Форматтеры дат терминала прогреваются отдельным простоем перед подъёмом:
 * первое их создание на странице поднимает данные локали, и в общем куске с
 * монтированием это была заметная доля задачи.
 */
export function TerminalDemo() {
  const root = useRef<HTMLDivElement>(null);
  /** Был у экрана — поднят и дальше не снимается; у экрана сейчас — идёт. */
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const client = useSyncExternalStore(noop, () => true, () => false);
  const locale = terminalIntl(useLocale());
  const intl = useRef(locale);
  useLayoutEffect(() => {
    intl.current = locale;
  }, [locale]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let waiting = false;
    let timer = 0;
    let idle = 0;
    const mount = () => startTransition(() => setNear(true));
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const idleThen = (fn: () => void) =>
          window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 1000 }) : window.setTimeout(fn, 0);
        idle = idleThen(() => {
          timeLabelFormats(intl.current);
          idle = idleThen(mount);
        });
      }, SETTLE);
    };
    const onScroll = () => {
      if (waiting) later();
    };

    const screen = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        setOnScreen(hit);
        if (hit) mount();
      },
      { rootMargin: '600px 0px' },
    );
    const ahead = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || waiting) return;
        waiting = true;
        later();
      },
      { rootMargin: '150% 0px' },
    );
    screen.observe(el);
    ahead.observe(el);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      screen.disconnect();
      ahead.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, []);

  return (
    <Wrap className="ls-tdemo">
      {/* Вдали от экрана мерцание заглушки стоит (`landing.css`): оно
          перерисовывалось каждый кадр с самой загрузки, пока гость смотрит на
          первый экран. */}
      <div ref={root} data-far={onScreen ? undefined : ''}>
        {client && near ? <DemoTerminal paused={!onScreen} /> : <TerminalSkeleton live badge={false} leave={false} tables={false} />}
      </div>
    </Wrap>
  );
}

function DemoTerminal({ paused }: { paused: boolean }) {
  const { detail, actions, priceOf } = useDemoTerminal();

  return (
    <TerminalHints>
      <Terminal
        detail={detail}
        actions={actions}
        source={DEMO_SOURCE}
        symbols={DEMO_SYMBOLS}
        decimalsOf={demoDecimalsOf}
        priceOf={priceOf}
        badge={false}
        tags={false}
        serverStats={false}
        tables={false}
        paused={paused}
      />
    </TerminalHints>
  );
}
