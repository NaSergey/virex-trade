/**
 * Короткие звуки на Web Audio: один `AudioContext` на вкладку, каждая запись
 * грузится и декодируется один раз.
 *
 * Не `<audio>`: у элемента задержка старта плавает от раза к разу, а звук
 * здесь идёт за анимацией — карта обязана шуршать, когда полетела, а не
 * когда браузер соберётся. Web Audio ставит звук на часы контекста с точностью
 * до сэмпла, и очередь из двух десятков карт сдачи ложится ровно в свои моменты.
 *
 * Пока браузер не разблокировал звук жестом, контекст стоит, и `play` звук
 * молча пропускает, а не копит: часы стоящего контекста не идут, и всё
 * накопленное выстрелило бы разом на первый клик.
 */

let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
const loading = new Set<string>();
const active = new Set<AudioBufferSourceNode>();
const noop = () => undefined;

function context(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;
  const c = new AudioContext();
  ctx = c;
  // Разблокировка: браузер отпускает звук только по жесту. Со страницы, куда
  // пришли кликом по сайту, контекст стартует сам, а после перезагрузки ждёт.
  const unlock = () => {
    if (c.state === 'running') return off();
    void c.resume().then(() => c.state === 'running' && off());
  };
  const off = () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  return c;
}

/**
 * Контекст вкладки — для звуков, собранных на месте (синтез джетпака), а не
 * из записей: второй контекст разблокировался бы отдельно и стоял бы, пока
 * первый уже играет.
 */
export function audioContext(): AudioContext | null {
  return context();
}

/** Загрузить записи заранее: первая карта сдачи не должна ждать сети. */
export function preload(urls: readonly string[]) {
  const c = context();
  if (!c) return;
  for (const url of urls) {
    if (buffers.has(url) || loading.has(url)) continue;
    loading.add(url);
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => c.decodeAudioData(data))
      .then((buf) => void buffers.set(url, buf))
      // Звук — украшение: не загрузился — стол играет молча, а следующий
      // заход попробует снова.
      .catch(noop)
      .finally(() => loading.delete(url));
  }
}

/**
 * Сыграть запись через `delay` мс. `out` — своя шина вместо выхода контекста
 * (у джетпака — общая громкость эффектов). Возвращает отмену.
 */
export function play(
  url: string,
  { delay = 0, gain = 1, out }: { delay?: number; gain?: number; out?: AudioNode } = {},
): () => void {
  const c = ctx;
  const buf = buffers.get(url);
  if (!c || c.state !== 'running' || !buf) return noop;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g).connect(out ?? c.destination);
  active.add(src);
  src.onended = () => {
    active.delete(src);
    g.disconnect();
  };
  src.start(c.currentTime + Math.max(0, delay) / 1000);
  return () => stop(src);
}

/** Оборвать всё, что играет и что запланировано. */
export function stopAll() {
  active.forEach(stop);
  active.clear();
}

function stop(src: AudioBufferSourceNode) {
  try {
    src.stop();
  } catch {
    // уже доиграл
  }
}
