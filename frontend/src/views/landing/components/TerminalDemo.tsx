'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Wrap } from '@/shared/ui/Wrap';
import { Terminal, TerminalSkeleton } from '@/widgets/backtest-session';
import { DEMO_SOURCE, DEMO_SYMBOLS, demoDecimalsOf } from '../lib/demoMarket';
import { useDemoTerminal } from '../model/useDemoTerminal';
import { TerminalHints } from './TerminalHints';

const noop = () => () => undefined;

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
 */
export function TerminalDemo() {
  const t = useTranslations('landing.term');
  const root = useRef<HTMLDivElement>(null);
  /** Был у экрана — поднят и дальше не снимается; у экрана сейчас — идёт. */
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const client = useSyncExternalStore(noop, () => true, () => false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        setOnScreen(hit);
        if (hit) setNear(true);
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Wrap className="ls-tdemo">
      <div ref={root}>
        {client && near ? <DemoTerminal paused={!onScreen} /> : <TerminalSkeleton live badge={t('badge')} leave={false} />}
      </div>
    </Wrap>
  );
}

function DemoTerminal({ paused }: { paused: boolean }) {
  const t = useTranslations('landing.term');
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
        badge={t('badge')}
        tags={false}
        paused={paused}
      />
    </TerminalHints>
  );
}
