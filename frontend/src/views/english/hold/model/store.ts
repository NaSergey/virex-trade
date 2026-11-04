import { useEffect, useSyncExternalStore } from 'react';
import { apiJson } from '@/shared/api/http';
import { localDay } from '../../model/activity';
import { playSound } from '../../game/sound';
import { withPlaces, type HoldState } from './rules';
import { soundOf } from './sound';

/**
 * Игра лежит в localStorage после каждого действия (вкладку можно закрыть посреди дня) и
 * через секунду уходит на сервер (`/api/admin/english/hold`): телефон и компьютер играют одну
 * игру. Открывая страницу, берём более свежую из двух — по моменту сохранения (`savedAt`), а
 * сервер не даёт старой записи затереть новую. Нет сети — играем дальше, уйдёт со следующим
 * сохранением. Каждая понятая фраза (рост `stats.phrases`) засчитывается в активность дня —
 * её видно на «Сегодня», как ответы первой игры.
 */
const KEY = 'virex.english.hold.game';
const AT_KEY = 'virex.english.hold.savedAt';
const URL = '/api/admin/english/hold';

let cache: HoldState | null | undefined;
let savedAt = 0;
const listeners = new Set<() => void>();

const parse = (raw: unknown): HoldState | null => {
  const g = raw as HoldState | null;
  return g && g.v === 1 ? withPlaces(g) : null;
};

function read(): HoldState | null {
  if (cache !== undefined) return cache;
  try {
    cache = parse(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
    savedAt = Number(localStorage.getItem(AT_KEY)) || 0;
  } catch {
    cache = null;
  }
  return cache;
}

function writeLocal(next: HoldState | null, at: number) {
  cache = next;
  savedAt = at;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
    localStorage.setItem(AT_KEY, String(at));
  } catch {
    // Хранилище закрыто — игра живёт до перезагрузки и на сервере.
  }
  listeners.forEach((l) => l());
}

let timer: ReturnType<typeof setTimeout> | null = null;
function push() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const g = cache;
    const at = savedAt;
    const req = g
      ? apiJson(URL, { method: 'PUT', body: JSON.stringify({ state: g, savedAt: at }) })
      : apiJson(URL, { method: 'DELETE' });
    req.catch(() => {
      // Сеть или сервер — уйдёт со следующим сохранением.
    });
  }, 1000);
}

export function saveGame(next: HoldState | null): void {
  const prev = read();
  writeLocal(next, Date.now());
  push();
  const sound = soundOf(prev, next);
  if (sound) playSound(sound);
  const gained = Math.min(5, (next?.stats.phrases ?? 0) - (prev?.stats.phrases ?? 0));
  for (let i = 0; i < gained; i++) {
    apiJson('/api/admin/english/game', { method: 'POST', body: JSON.stringify({ day: localDay(Date.now()) }) }).catch(() => {});
  }
}

let synced = false;
/** Один раз за загрузку страницы: свериться с сервером и взять свежее. */
async function sync() {
  if (synced) return;
  synced = true;
  read();
  try {
    const remote = await apiJson<{ state: unknown; savedAt: number } | null>(URL);
    if (remote && remote.savedAt > savedAt) writeLocal(parse(remote.state), remote.savedAt);
    else if (cache && (!remote || remote.savedAt < savedAt)) push();
  } catch {
    synced = false;
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** `undefined` — ещё не прочитано (сервер), `null` — игры нет. */
export function useGame(): HoldState | null | undefined {
  useEffect(() => {
    void sync();
  }, []);
  return useSyncExternalStore(subscribe, read, () => undefined);
}
