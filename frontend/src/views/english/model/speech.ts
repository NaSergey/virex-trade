import { AUDIO_BASE, audioId } from './audio';

/**
 * Озвучка и распознавание речи. Фразы материала звучат записями нейросетевого
 * голоса, остальное и распознавание — Web Speech API браузера.
 */

/**
 * Голос браузера — запасной, для фраз без записи (свои слова). Лучше всего
 * нейросетевые: «Natural»/«Neural»/«Online» у Edge, «Enhanced»/«Premium» у
 * iPhone, «Google» у Chrome; встроенные голоса Windows звучат роботом. Среди
 * равных — британский, как в учебнике.
 */
export function pickVoice<V extends { lang: string; name?: string }>(voices: readonly V[]): V | null {
  const score = (v: V) => {
    const lang = v.lang.replace('_', '-').toLowerCase();
    if (!lang.startsWith('en')) return -1;
    const name = v.name ?? '';
    const quality = /natural|neural|online|premium|enhanced/i.test(name) ? 10 : /google/i.test(name) ? 6 : 0;
    return quality + (lang === 'en-gb' ? 3 : lang === 'en-us' ? 2 : 1);
  };
  let best: V | null = null;
  for (const v of voices) if (score(v) >= 0 && (!best || score(v) > score(best))) best = v;
  return best;
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

function synth(text: string, slow: boolean): void {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(synth.getVoices());
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? 'en-GB';
  utterance.rate = slow ? 0.7 : 0.95;
  synth.speak(utterance);
}

/** Записи, которых нет (своё слово, новая фраза), — больше не запрашиваются. */
const missing = new Set<string>();
let playing: HTMLAudioElement | null = null;

/**
 * Произнести: запись нейросетевого голоса (`model/audio.ts`), а нет записи —
 * голос браузера. Медленно — та же запись на 0.75 без смены высоты голоса.
 */
export function speak(text: string, slow = false): void {
  if (typeof window === 'undefined') return;
  playing?.pause();
  if (canSpeak()) window.speechSynthesis.cancel();
  const id = audioId(text);
  if (missing.has(id)) return synth(text, slow);
  const audio = new Audio(`${AUDIO_BASE}/${id}.mp3`);
  audio.playbackRate = slow ? 0.75 : 1;
  playing = audio;
  audio.play().catch((e: unknown) => {
    // Запрет автозапуска — не отсутствие записи: голос браузера запрещён так же.
    if (e instanceof DOMException && e.name === 'NotAllowedError') return;
    missing.add(id);
    if (playing === audio) synth(text, slow);
  });
}

/** Распознавание — только Chrome и Edge; в lib.dom его типов нет. */
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = () => recognitionCtor() !== null;

/** Слушает одну фразу. Возвращает «остановить». */
export function listen(handlers: {
  onText: (text: string, final: boolean) => void;
  onEnd: () => void;
  onError: (code: string) => void;
}): () => void {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    handlers.onError('unsupported');
    handlers.onEnd();
    return () => {};
  }
  const r = new Ctor();
  r.lang = 'en-GB';
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  r.onresult = (e) => {
    let text = '';
    let final = true;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      if (!e.results[i].isFinal) final = false;
    }
    handlers.onText(text.trim(), final);
  };
  r.onerror = (e) => handlers.onError(e.error);
  r.onend = handlers.onEnd;
  r.start();
  return () => r.stop();
}
