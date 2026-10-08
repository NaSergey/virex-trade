'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Какая подсказка у какой метки терминала. Метки — `data-tour` на узлах самого
 * терминала (`widgets/backtest-session`), тот же приём, что у обучения
 * продукта: узлы уже есть, к ним только привязывается текст.
 */
const HINT_OF: Record<string, string> = {
  'term-sound': 'sound',
  'term-draw': 'draw',
  'term-lvl-entry': 'position',
  'term-lvl-stop': 'stopLine',
  'term-lvl-take': 'takeLine',
  'term-lvl-liq': 'liq',
  'term-lvl-limitClose': 'limitClose',
  'term-lvl-pendingEntry': 'pendingEntry',
  'term-lvl-gridTake': 'gridTake',
  'term-lvl-limitEntry': 'draft',
  'term-lvl-gridUpper': 'draft',
  'term-lvl-gridLower': 'draft',
  'term-lvl-gridStep': 'draft',
  'term-plate-pick': 'platePick',
  'term-plate-grid': 'plateGrid',
  'term-plate-x': 'plateX',
  'term-badge': 'badge',
  'term-tables': 'tables',
  'term-orders': 'orders',
  'term-history': 'history',
  'term-deposit': 'deposit',
  'term-leverage': 'leverage',
  'term-risk': 'risk',
  'term-take': 'take',
  'term-stop': 'stop',
  'term-entry-price': 'entryPrice',
  'term-scaled-range': 'scaledRange',
  'term-scaled-count': 'scaledCount',
  'term-size': 'size',
  'term-market-buttons': 'marketButtons',
  'term-limit-buttons': 'limitButtons',
  'term-scaled-buttons': 'scaledButtons',
  'term-close-grid': 'closeGrid',
};

/** Отступ подсказки от курсора и от края окна. */
const GAP = 16;
const EDGE = 8;
/** Сколько подсказка держится после касания: у пальца нет «увёл курсор». */
const TOUCH_MS = 4000;

/** Подсказка — справа снизу от точки, а у края окна — по другую сторону от неё. */
function placeTip(el: HTMLElement | null, x: number, y: number) {
  if (!el) return;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const left = x + GAP + w > window.innerWidth - EDGE ? x - GAP - w : x + GAP;
  const top = y + GAP + h > window.innerHeight - EDGE ? y - GAP - h : y + GAP;
  el.style.translate = `${Math.max(EDGE, left)}px ${Math.max(EDGE, top)}px`;
}

/**
 * Терминал с подсказками: наведение на любую его часть показывает рядом с
 * курсором, что она делает. Сам терминал о подсказках не знает — обёртка
 * ловит движение указателя и ищет ближайшую метку над узлом под ним.
 *
 * Положение подсказки пишется в стиль напрямую, а не состоянием: оно меняется
 * на каждом движении мыши, и перерисовывать ради него терминал нельзя.
 * Состояние меняется, только когда меняется сама подсказка.
 *
 * Пока зажата кнопка (тянут уровень, двигают график) подсказки нет — она
 * висела бы над тем, что человек сейчас двигает. Кнопки строки позиции
 * пропущены: у них свои подписи.
 */
export function TerminalHints({ children }: { children: ReactNode }) {
  const t = useTranslations('landing.term.hints');
  const root = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const at = useRef({ x: 0, y: 0 });
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  // Новая подсказка другого размера — место считается уже по ней.
  useLayoutEffect(() => placeTip(tip.current, at.current.x, at.current.y), [hint]);
  useEffect(
    () => () => {
      if (touchTimer.current) clearTimeout(touchTimer.current);
    },
    [],
  );

  const hintAt = (target: EventTarget | null): string | null => {
    if (!(target instanceof Element) || target.closest('.row-actions')) return null;
    const mark = target.closest('[data-tour^="term-"]');
    if (!mark || !root.current?.contains(mark)) return null;
    return HINT_OF[mark.getAttribute('data-tour') ?? ''] ?? null;
  };

  return (
    <div
      ref={root}
      className="ls-hints"
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return;
        at.current = { x: e.clientX, y: e.clientY };
        const next = e.buttons ? null : hintAt(e.target);
        if (next !== hint) setHint(next);
        else placeTip(tip.current, e.clientX, e.clientY);
      }}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHint(null)}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') {
          setHint(null);
          return;
        }
        at.current = { x: e.clientX, y: e.clientY };
        setHint(hintAt(e.target));
        if (touchTimer.current) clearTimeout(touchTimer.current);
        touchTimer.current = setTimeout(() => setHint(null), TOUCH_MS);
      }}
    >
      {children}
      {hint && (
        <div ref={tip} className="ls-hint" role="tooltip">
          <strong>{t(`${hint}.title`)}</strong>
          <span>{t(`${hint}.body`)}</span>
        </div>
      )}
    </div>
  );
}
