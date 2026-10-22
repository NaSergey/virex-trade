/**
 * Озвучка записями: фразы материала заранее озвучены нейросетевым голосом
 * (Kokoro, `tools/audio.py`) и лежат файлами `<id>.mp3`. Имя файла — хэш
 * текста, его считает и выгрузка фраз для озвучки (`tools/export-texts.ts`), и
 * плеер: второй таблицы «текст → файл» нет.
 *
 * Каталог — имя голоса: смена голоса меняет адрес, и браузер не играет старые
 * записи из кэша. Голос выбран владельцем по образцам (`bf_emma` забракован).
 */
export const VOICE = 'af_heart';
export const AUDIO_BASE = `/assets/english-audio/${VOICE}`;

/** cyrb53 — быстрый 53-битный хэш строки; коллизий на десятках тысяч фраз нет. */
function cyrb53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export const audioId = (text: string) => cyrb53(text.trim()).toString(36);
export const audioUrl = (text: string) => `${AUDIO_BASE}/${audioId(text)}.mp3`;
