import { NOTIF_DEFS, NotifDef, NotifKey, notifDef } from './registry';

export interface PrefItem {
  enabled: boolean;
  /** Индекс в NotifDef.presets. */
  preset: number;
}

export interface Prefs {
  items: Record<string, PrefItem>;
  /** true — тихие часы соблюдаются. */
  quietHours: boolean;
}

/** Форма, в которой настройки лежат в User.notifyPrefs: только отклонения. */
export interface StoredPrefs {
  items: Record<string, { e?: boolean; p?: number }>;
  quietHours?: boolean;
}

const DEFAULT_QUIET_HOURS = true;

export const defaultPrefs = (): Prefs => ({
  items: Object.fromEntries(
    NOTIF_DEFS.map((d) => [d.key, { enabled: d.defaultEnabled, preset: d.defaultPreset }]),
  ),
  quietHours: DEFAULT_QUIET_HOURS,
});

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Индекс пресета, если он существует у этого сигнала; иначе — дефолтный. */
const safePreset = (def: NotifDef, raw: unknown): number => {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return def.defaultPreset;
  if (def.presets.length === 0) return 0;
  return raw >= 0 && raw < def.presets.length ? raw : def.defaultPreset;
};

/**
 * Накладывает сохранённое на дефолты реестра. Ключ, которого в реестре нет,
 * молча выбрасывается: сигнал могли удалить, а строка в базе осталась, и
 * падать из-за неё панель настроек не должна.
 */
export const mergePrefs = (stored: unknown): Prefs => {
  const base = defaultPrefs();
  if (!isObject(stored)) return base;
  const items = isObject(stored.items) ? stored.items : {};
  for (const [key, raw] of Object.entries(items)) {
    const def = notifDef(key);
    if (!def || !isObject(raw)) continue;
    base.items[key] = {
      enabled: typeof raw.e === 'boolean' ? raw.e : def.defaultEnabled,
      preset: safePreset(def, raw.p),
    };
  }
  if (typeof stored.quietHours === 'boolean') base.quietHours = stored.quietHours;
  return base;
};

/** Обратная операция: в базу уезжает только то, что отличается от дефолта. */
export const toStored = (prefs: Prefs): StoredPrefs => {
  const items: StoredPrefs['items'] = {};
  for (const def of NOTIF_DEFS) {
    const item = prefs.items[def.key];
    if (!item) continue;
    const diff: { e?: boolean; p?: number } = {};
    if (item.enabled !== def.defaultEnabled) diff.e = item.enabled;
    if (item.preset !== def.defaultPreset) diff.p = item.preset;
    if (Object.keys(diff).length > 0) items[def.key] = diff;
  }
  const out: StoredPrefs = { items };
  if (prefs.quietHours !== DEFAULT_QUIET_HOURS) out.quietHours = prefs.quietHours;
  return out;
};

export const isEnabled = (prefs: Prefs, key: NotifKey | string): boolean =>
  prefs.items[key]?.enabled ?? false;

/** Значение текущего пресета. null — у сигнала нет порога. */
export const thresholdOf = (prefs: Prefs, key: NotifKey | string): number | null => {
  const def = notifDef(key);
  if (!def || def.presets.length === 0) return null;
  const idx = prefs.items[key]?.preset ?? def.defaultPreset;
  return def.presets[idx]?.value ?? def.presets[def.defaultPreset].value;
};

/** Подпись текущего пресета для кнопки. null — порога нет. */
export const presetLabelOf = (prefs: Prefs, key: NotifKey | string): string | null => {
  const def = notifDef(key);
  if (!def || def.presets.length === 0) return null;
  const idx = prefs.items[key]?.preset ?? def.defaultPreset;
  return (def.presets[idx] ?? def.presets[def.defaultPreset]).label;
};

export const togglePref = (prefs: Prefs, key: NotifKey | string): Prefs => {
  const item = prefs.items[key];
  if (!item) return prefs;
  return { ...prefs, items: { ...prefs.items, [key]: { ...item, enabled: !item.enabled } } };
};

export const cyclePreset = (prefs: Prefs, key: NotifKey | string): Prefs => {
  const def = notifDef(key);
  const item = prefs.items[key];
  if (!def || !item || def.presets.length === 0) return prefs;
  const next = (item.preset + 1) % def.presets.length;
  return { ...prefs, items: { ...prefs.items, [key]: { ...item, preset: next } } };
};
