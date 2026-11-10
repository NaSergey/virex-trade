'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { SlotsBonus } from '@/entities/slots';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { cn } from '@/shared/lib/utils/css';
import type { Fx } from '../lib/fx';
import * as sound from '../lib/sound';

type Pick = Extract<SlotsBonus, { kind: 'pick' }>;
/** Что лежит в сундуке, когда его открыли: приз, «Забрать» или (после конца) чужой приз. */
type Box = { kind: 'prize' | 'collect' | 'missed'; value: number } | null;

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

/**
 * Сокровищница: двенадцать сундуков, игрок открывает их по одному, пока не
 * найдёт «Забрать». Исход решил сервер: k-й открытый сундук показывает k-й
 * приз последовательности, какой бы ни выбрали, — поэтому раунд не ждёт
 * ответа и не может разойтись с начисленным. После «Забрать» открываются
 * остальные — что там было, видно, но не засчитано.
 *
 * Сундуки открывает только игрок — автоспина здесь нет (владелец 2026-11-10).
 */
export function PickBonus({
  bonus,
  fx,
  audible,
  onDone,
}: {
  bonus: Pick;
  fx: Fx | null;
  audible: boolean;
  onDone: () => void;
}) {
  const t = useTranslations('slots');
  const n = bonus.picks.length + bonus.rest.length + 1;
  const [boxes, setBoxes] = useState<Box[]>(() => Array.from({ length: n }, () => null));
  const [opened, setOpened] = useState(0);
  const [total, setTotal] = useState(0);
  const [over, setOver] = useState(false);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const finish = useRef(onDone);
  useEffect(() => {
    finish.current = onDone;
  });

  const open = (i: number) => {
    if (over || boxes[i]) return;
    const el = refs.current[i];
    const c = el?.getBoundingClientRect();
    const next = boxes.slice();
    if (opened < bonus.picks.length) {
      const value = bonus.picks[opened];
      next[i] = { kind: 'prize', value };
      setTotal((v) => v + value);
      if (audible) sound.chestOpen(value);
      if (c) {
        fx?.burst(c.left + c.width / 2, c.top + c.height / 2, 18, 380);
        fx?.fountain(c.left + c.width / 2, c.top + c.height * 0.3, Math.min(30, 6 + value / 10), 0.6);
      }
    } else {
      next[i] = { kind: 'collect', value: 0 };
      setOver(true);
      if (audible) sound.collect();
      // Остальные открываются следом, по одному: видно, что лежало рядом.
      const rest = bonus.rest.slice();
      next.forEach((b, k) => {
        if (b || k === i) return;
        const value = rest.shift() ?? 0;
        window.setTimeout(
          () => setBoxes((cur) => cur.map((x, m) => (m === k ? { kind: 'missed', value } : x))),
          500 + k * 70,
        );
      });
    }
    setBoxes(next);
    setOpened((v) => v + 1);
  };

  useEffect(() => {
    if (!over) return;
    if (audible && bonus.win > 0) sound.winChime(6);
    const id = window.setTimeout(() => finish.current(), 4200);
    return () => clearTimeout(id);
  }, [over, audible, bonus.win]);

  return (
    <div className="sl-bonus sl-pick" role="dialog" aria-label={t('pick.title')}>
      <div className="sl-bonus-head">
        <div className="sl-bonus-title" data-text={t('pick.title')}>
          {t('pick.title')}
        </div>
        <p>{over ? t('pick.over') : t('pick.hint')}</p>
        <div className="sl-bonus-total">
          <CoinIcon className="sl-big-coin" />
          {fmt(total)}
        </div>
      </div>
      <div className="sl-chests">
        {boxes.map((b, i) => (
          <button
            key={i}
            type="button"
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={cn('sl-chest', b && `is-${b.kind}`)}
            style={{ ['--i' as string]: i }}
            onClick={() => open(i)}
            disabled={!!b || over}
            aria-label={b ? (b.kind === 'collect' ? t('pick.collect') : fmt(b.value)) : t('pick.closed')}
          >
            <svg viewBox="0 0 100 100" aria-hidden className="sl-chest-art">
              <use href="#sl-s-chest" />
            </svg>
            {b && (
              <span className="sl-chest-prize">
                {b.kind === 'collect' ? (
                  t('pick.collect')
                ) : (
                  <>
                    {fmt(b.value)}
                    <CoinIcon className="sl-coin-i" />
                  </>
                )}
              </span>
            )}
          </button>
        ))}
      </div>
      {over && (
        <button type="button" className="sl-bonus-go" onClick={() => finish.current()}>
          {t('pick.take', { n: fmt(bonus.win) })}
        </button>
      )}
    </div>
  );
}
