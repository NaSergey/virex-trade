'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { InputLog, type Input, type LiveStore, type RaceView } from '@/entities/race';
import { RaceCanvas } from '@/widgets/race-scene';
import { createLiveSource, type LiveHud } from '../model/liveSource';
import { Pad } from '../model/pad';
import { Hud } from './Hud';
import { Result } from './Result';
import { TouchPad } from './TouchPad';

const KEYS: Record<string, 'left' | 'right' | 'brake'> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'brake',
  KeyS: 'brake',
  Space: 'brake',
};

/**
 * Идущая гонка: сцена, руль, цифры, итог. Нажатие уходит сразу и пульсом раз в
 * 250 мс (без пульса сервер через секунду считает кнопки отпущенными); цифры
 * перечитываются из источника кадров 10 раз в секунду, а не на каждом кадре.
 */
export function Live({
  view,
  store,
  send,
  onChange,
}: {
  view: RaceView;
  store: LiveStore;
  send: (t: number, input: Input) => void;
  onChange: () => void;
}) {
  const t = useTranslations('race');
  const [log] = useState(() => new InputLog());
  const [src] = useState(() => createLiveSource(store, log, t('anon')));
  const [pad] = useState(() => new Pad());
  const over = view.phase === 'over';

  useEffect(() => {
    pad.listen((input) => {
      const at = store.clock();
      log.push(at, input);
      send(at, input);
    });
  }, [pad, store, log, send]);

  useEffect(() => {
    if (over) return;
    const down = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (!k) return;
      e.preventDefault();
      pad.set(k, true);
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (k) pad.set(k, false);
    };
    const blur = () => pad.release();
    const beat = setInterval(() => send(store.clock(), pad.input), 250);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      clearInterval(beat);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      pad.release();
    };
  }, [over, pad, store, send]);

  const [hud, setHud] = useState<LiveHud | null>(null);
  useEffect(() => {
    const id = setInterval(() => setHud(src.hud ? { ...src.hud } : null), 100);
    return () => clearInterval(id);
  }, [src]);

  return (
    <>
      <RaceCanvas source={src} className="rc-canvas" label={t('sceneLabel')} />
      {hud && !over && <Hud hud={hud} view={view} />}
      {!over && <TouchPad pad={pad} />}
      {over && <Result view={view} onChange={onChange} />}
    </>
  );
}
