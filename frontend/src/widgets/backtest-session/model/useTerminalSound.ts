'use client';

import { useEffect, useRef } from 'react';
import { audioContext } from '@/shared/lib/sound/player';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import type { SessionDetail } from '../api/types';
import { schedule, soundsOf, VOICES, type TerminalSound, type Voice } from '../lib/sounds';

const decodeOn = (raw: string | null) => raw !== '0';
const encodeOn = (on: boolean) => (on ? null : '0');

/**
 * Звук терминала включён — выключатель без громкости (решение владельца
 * 2026-09-26: громкость здесь не нужна), выбор на устройстве. Свой ключ, не
 * `virex.sound` столов и не каналы джетпака: заглушённые карты не должны
 * глушить стоп.
 */
export const useTerminalSoundOn = () => usePersistentValue('virex.terminal.sound', decodeOn, true, encodeOn);

/**
 * Громкость шины. Сигналы — фон к работе с графиком, а не событие страницы:
 * снижена владельцем 2026-09-26 («сделай тише»), было 0.49.
 */
const GAIN = 0.2;

/** Атака по умолчанию, мс: без неё начало ноты щёлкает. */
const ATTACK_MS = 4;

interface Graph {
  /** Громкость терминала на всех нотах сразу. */
  out: GainNode;
  noise: AudioBuffer;
}

const graphs = new WeakMap<AudioContext, Graph>();

/** Шина терминала на контекст вкладки. */
function graphOf(c: AudioContext): Graph {
  let g = graphs.get(c);
  if (!g) {
    const out = c.createGain();
    out.gain.value = GAIN;
    out.connect(c.destination);
    const noise = c.createBuffer(1, c.sampleRate / 10, c.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    g = { out, noise };
    graphs.set(c, g);
  }
  return g;
}

function voice(c: AudioContext, g: Graph, v: Voice, t0: number) {
  const t = t0 + (v.at ?? 0) / 1000;
  const end = t + v.dur / 1000;
  const env = c.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(v.gain, t + (v.attack ?? ATTACK_MS) / 1000);
  env.gain.exponentialRampToValueAtTime(0.0001, end);

  let src: AudioScheduledSourceNode;
  if (v.wave === 'noise') {
    const n = c.createBufferSource();
    n.buffer = g.noise;
    src = n;
  } else {
    const o = c.createOscillator();
    o.type = v.wave ?? 'sine';
    o.frequency.setValueAtTime(v.freq ?? 440, t);
    if (v.to) o.frequency.exponentialRampToValueAtTime(v.to, t + (v.glide ?? v.dur) / 1000);
    src = o;
  }

  let node: AudioNode = src;
  if (v.filter) {
    const f = c.createBiquadFilter();
    f.type = v.filter.type;
    f.frequency.value = v.filter.freq;
    node = node.connect(f);
  }
  node.connect(env).connect(g.out);
  src.onended = () => env.disconnect();
  src.start(t);
  src.stop(end + 0.05);
}

function playVoices(c: AudioContext, voices: readonly Voice[], delayMs: number) {
  const g = graphOf(c);
  const t0 = c.currentTime + delayMs / 1000;
  for (const v of voices) voice(c, g, v, t0);
}

/** Другая сессия — не событие: сигналы считаются только внутри одной. */
export const sessionSounds = (was: SessionDetail, next: SessionDetail): TerminalSound[] =>
  was.session.id !== next.session.id ? [] : soundsOf(was, next);

/**
 * Звук терминала бектеста: сигналы из разницы соседних снимков сессии
 * (`soundsOf`) и отказ сервера — по новой ошибке любой из мутаций `errors`.
 */
export function useTerminalSound(detail: SessionDetail, errors: readonly unknown[], audible: boolean) {
  useSnapshotSound(detail, sessionSounds, errors, audible);
}

/**
 * Движок сигналов терминала: что звучит, решает `diff` по двум соседним
 * снимкам. Бектест сравнивает снимки сессии, биржевой терминал — снимки счёта
 * на бирже; голоса и правила у них одни.
 *
 * `diff` обязан быть стабильной ссылкой (функция модуля): смена ссылки
 * перезапускает сравнение.
 *
 * Первый снимок — точка отсчёта: открывший терминал не слышит того, что было до
 * него. Включение звука не проигрывает пропущенное при выключенном. Сигналы
 * звучат и у фоновой вкладки — они для того, кто отвлёкся.
 *
 * Пока браузер не разблокировал звук жестом, сигналы пропускаются, а не
 * копятся — то же правило, что у `play`.
 */
export function useSnapshotSound<T>(
  snapshot: T,
  diff: (was: T, next: T) => readonly TerminalSound[],
  errors: readonly unknown[],
  audible: boolean,
) {
  const seen = useRef(snapshot);
  const seenErrors = useRef(errors);

  // Контекст заводится заранее: до первого сигнала он должен успеть
  // разблокироваться кликом по терминалу.
  useEffect(() => {
    if (audible) audioContext();
  }, [audible]);

  useEffect(() => {
    const was = seen.current;
    seen.current = snapshot;
    if (was === snapshot || !audible) return;
    const c = audioContext();
    if (!c || c.state !== 'running') return;
    for (const { sound, delay } of schedule(diff(was, snapshot))) playVoices(c, VOICES[sound], delay);
  }, [snapshot, diff, audible]);

  useEffect(() => {
    const was = seenErrors.current;
    seenErrors.current = errors;
    if (!audible) return;
    const fresh = errors.some((e, i) => e != null && e !== was[i]);
    const c = fresh ? audioContext() : null;
    if (c && c.state === 'running') playVoices(c, VOICES.reject, 0);
  }, [errors, audible]);
}
