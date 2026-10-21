/**
 * Озвучка и распознавание речи — Web Speech API браузера, сервер в них не
 * участвует. Голос — британский, как в книге; нет его — любой английский.
 */

/** Голос для озвучки: en-GB, затем en-US, затем любой английский. */
export function pickVoice<V extends { lang: string }>(voices: readonly V[]): V | null {
  const lang = (v: V) => v.lang.replace('_', '-').toLowerCase();
  return (
    voices.find((v) => lang(v) === 'en-gb') ??
    voices.find((v) => lang(v) === 'en-us') ??
    voices.find((v) => lang(v).startsWith('en')) ??
    null
  );
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text: string, slow = false): void {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(synth.getVoices());
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? 'en-GB';
  utterance.rate = slow ? 0.6 : 0.9;
  synth.speak(utterance);
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
