'use client';

import { useEffect, useLayoutEffect, useRef, useState, type AnimationEvent, type CSSProperties } from 'react';
import { Music, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AudioChannel } from '@/shared/lib/sound/useAudioChannel';
import { cn } from '@/shared/lib/utils/css';
import { Button } from '@/shared/ui/Button';
import { Slider } from '@/shared/ui/Slider';

export interface AudioControlProps {
  channel: AudioChannel;
  /** Что за канал: от этого иконка и имя для скринридера. */
  kind?: 'sound' | 'music';
  className?: string;
}

/** Окошко: закрыто, открыто или уходит — анимация ухода доигрывает, прежде чем узел снимется. */
type Phase = 'closed' | 'open' | 'closing';

/** Отступ окошка от края экрана. */
const EDGE = 8;

/**
 * Звук игры одной кнопкой: иконка показывает состояние канала, по клику —
 * окошко с громкостью и выключателем. Общий для всех игр: канал даёт
 * `useAudioChannel`, игра только решает, где кнопка стоит.
 *
 * Окошко — узкая колонка под кнопкой: вертикальный ползунок и выключатель;
 * ни подписи, ни процентов нет (решение владельца 2026-09-26) — канал видно
 * по кнопке, уровень — по ползунку, а скринридер слышит и то и другое. Выпадает из-под кнопки:
 * сначала оно само, следом сверху вниз его элементы. Уходит обратным
 * движением, поэтому закрытие двухшаговое, как у окон продукта: сначала
 * `closing`, узел снимается по концу анимации ухода.
 *
 * Выключатель — в окошке, а не на самой кнопке: у кнопки одно действие, и
 * клик, который то глушит звук, то открывает ползунок, пришлось бы угадывать.
 * У выключенного канала ползунок стоит на нуле, а сдвинутый — включает канал.
 *
 * Краски — прикладные имена темы (`--ground`, `--ink`, `--hair`): игра,
 * переопределившая их на своей странице, получает окошко в своём тоне без
 * правок компонента. Поэтому окошко рисуется на месте, а не порталом в
 * `body`, — там переопределений страницы уже нет.
 */
export function AudioControl({ channel, kind = 'sound', className }: AudioControlProps) {
  const t = useTranslations('audio');
  const [phase, setPhase] = useState<Phase>('closed');
  const ref = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const label = t(kind);
  const shown = channel.audible ? Math.round(channel.volume * 100) : 0;
  const open = phase === 'open';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPhase('closing');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPhase('closing');
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Окошко стоит по центру кнопки, и у края экрана оно ушло бы за него —
  // сдвигается внутрь. Сдвиг — свойство `translate`: `transform` занят анимацией.
  useLayoutEffect(() => {
    const el = pop.current;
    if (!open || !el) return;
    el.style.removeProperty('--audio-shift');
    const r = el.getBoundingClientRect();
    let dx = 0;
    if (r.right > window.innerWidth - EDGE) dx = window.innerWidth - EDGE - r.right;
    if (r.left + dx < EDGE) dx = EDGE - r.left;
    if (dx) el.style.setProperty('--audio-shift', `${dx}px`);
  }, [open]);

  const toggle = () => setPhase((p) => (p === 'open' ? 'closing' : 'open'));
  // Анимации элементов всплывают сюда же — снимает узел только уход самого окошка.
  const onAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && phase === 'closing') setPhase('closed');
  };

  const level = !channel.audible ? <VolumeX aria-hidden /> : channel.volume < 0.5 ? <Volume1 aria-hidden /> : <Volume2 aria-hidden />;
  const item = (i: number) => ({ '--i': i }) as CSSProperties;

  return (
    <div ref={ref} className={cn('audio', className)} data-off={channel.audible ? undefined : true}>
      <Button
        variant="none"
        className={cn('audio-btn', kind)}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        {kind === 'music' ? <Music aria-hidden /> : level}
      </Button>
      {phase !== 'closed' && (
        <div
          ref={pop}
          className="audio-pop"
          role="dialog"
          aria-label={label}
          data-state={open ? 'open' : 'closed'}
          onAnimationEnd={onAnimationEnd}
        >
          <Slider
            className="audio-slider"
            value={shown}
            min={0}
            max={100}
            step={5}
            aria-label={t('volume')}
            onChange={(v) => channel.setVolume(v / 100)}
          />
          <Button
            variant="none"
            className="audio-mute"
            style={item(1)}
            aria-pressed={!channel.on}
            aria-label={channel.on ? t('mute') : t('unmute')}
            title={channel.on ? t('mute') : t('unmute')}
            onClick={() => channel.setOn(!channel.on)}
          >
            {level}
          </Button>
        </div>
      )}
    </div>
  );
}
