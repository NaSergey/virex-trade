'use client';

import { useEffect, useRef } from 'react';
import type { JetpackView } from '@/entities/jetpack';
import { audioContext, play, preload, stopAll } from '@/shared/lib/sound/player';
import { useAudioChannel } from '@/shared/lib/sound/useAudioChannel';
import { mAt, thrustAt } from '../lib/flight';
import { Music } from '../lib/music';
import { driveOf, engineTone, soundEvents } from '../lib/sound';
import { busesOf, Engine, ignition } from '../lib/synth';
import { useFrames } from './useFrames';

/**
 * Каналы джетпака — эффекты и музыка: выключатель и громкость каждого, выбор
 * на устройстве (`AudioControl` в верхней панели). Ключи свои, не общий
 * `virex.sound` столов: рёв ракеты и шорох карт — разные вещи, и выключенный
 * здесь гул не должен глушить стол. Музыка по умолчанию тише эффектов: она
 * фон, а взрыв — событие.
 */
export const useJetpackSfx = () => useAudioChannel('virex.jetpack.sound', 0.8);
export const useJetpackMusic = () => useAudioChannel('virex.jetpack.music', 0.6);

/**
 * Записи — Kenney CC0 (`public/assets/sounds`): фишка и выигрыш общие со
 * столами, взрыв — свой, двумя слоями: раскат с хрустом и низкий удар под
 * ним — один без другого звучит либо тонко, либо глухо.
 */
const file = (name: string) => `/assets/sounds/${name}.mp3`;
const CHIP = file('chip');
const WINS = [file('win-1'), file('win-2')];
const BLAST = file('explosion');
const BLAST_LOW = file('explosion-low');
const pick = (files: string[]) => files[Math.floor(Math.random() * files.length)];

/** Параметры двигателя и музыки обновляются не чаще этого — чаще ухо не различит. */
const TONE_MS = 50;

/**
 * Звук страницы джетпака. События (взлёт, краш, своя ставка, свой вывод)
 * выводятся из разницы соседних снимков (`soundEvents`) — открывший страницу
 * посреди полёта слышит двигатель, но не зажигание. Двигатель живёт, пока
 * раунд в полёте, и берёт тягу и множитель с кадра — от тех же часов
 * сервера, что и сцена. Отсчёта перед взлётом нет: тиканье снято владельцем
 * (2026-09-26).
 *
 * Громкость канала — усиление его шины; молчащий канал (выключен или на
 * нуле) не запускается вовсе. Фоновая вкладка глушит всё: без картинки рёв и
 * музыка — шум.
 */
export function useJetpackSound(view: JetpackView) {
  const sfx = useJetpackSfx();
  const mus = useJetpackMusic();
  const sound = sfx.audible;
  const music = mus.audible;
  const prev = useRef<JetpackView | null>(null);
  const engine = useRef<Engine | null>(null);
  const tune = useRef<Music | null>(null);
  const toned = useRef(0);
  const flying = view.phase === 'flying';

  useEffect(() => {
    const c = audioContext();
    if (!c) return;
    const buses = busesOf(c);
    const apply = () => {
      const on = document.visibilityState === 'visible';
      buses.sfx.gain.setTargetAtTime(on ? sfx.gain : 0, c.currentTime, 0.05);
      buses.music.gain.setTargetAtTime(on ? mus.gain : 0, c.currentTime, 0.05);
      tune.current?.setAwake(on);
    };
    apply();
    document.addEventListener('visibilitychange', apply);
    return () => document.removeEventListener('visibilitychange', apply);
  }, [sfx.gain, mus.gain]);

  useEffect(() => {
    if (!sound) return;
    preload([CHIP, ...WINS, BLAST, BLAST_LOW]);
    // Выключили звук или ушли со страницы — запланированное обрывается.
    return stopAll;
  }, [sound]);

  // События — по смене снимка; включение звука не проигрывает прошедшее.
  useEffect(() => {
    const events = soundEvents(prev.current, view);
    prev.current = view;
    const c = audioContext();
    if (!sound || !c || c.state !== 'running') return;
    const out = busesOf(c).sfx;
    for (const e of events) {
      if (e === 'launch') ignition(c, out);
      else if (e === 'crash') {
        play(BLAST, { gain: 0.9, out });
        play(BLAST_LOW, { gain: 0.8, out });
      } else if (e === 'bet') play(CHIP, { gain: 0.8, out });
      else play(pick(WINS), { gain: 0.9, out });
    }
  }, [view, sound]);

  useEffect(() => {
    const c = audioContext();
    if (!sound || !flying || !c) return;
    const e = new Engine(c, busesOf(c).sfx);
    engine.current = e;
    return () => {
      e.stop();
      engine.current = null;
    };
  }, [sound, flying]);

  useEffect(() => {
    const c = audioContext();
    if (!music || !c) return;
    const m = new Music(c, busesOf(c).music);
    m.setAwake(document.visibilityState === 'visible');
    tune.current = m;
    return () => {
      m.stop();
      tune.current = null;
    };
  }, [music]);

  // После эффекта музыки: включённая посреди полёта, она сразу играет полётную часть.
  useEffect(() => {
    tune.current?.setFlight(flying);
  }, [flying, music]);

  useFrames(flying && (sound || music), () => {
    const now = Date.now();
    if (view.launchedAt === null || now - toned.current < TONE_MS) return;
    toned.current = now;
    const ms = now + view.offset - view.launchedAt;
    const m = mAt(ms, view.rate);
    engine.current?.set(engineTone(thrustAt(ms), m));
    tune.current?.setDrive(driveOf(m));
  });
}
