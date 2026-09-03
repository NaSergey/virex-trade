import { NOTIF_DEFS } from './registry';
import {
  cyclePreset,
  defaultPrefs,
  isEnabled,
  mergePrefs,
  thresholdOf,
  togglePref,
  toStored,
} from './prefs';

describe('prefs', () => {
  it('дефолты берутся из реестра для всех ключей', () => {
    const p = defaultPrefs();
    expect(Object.keys(p.items)).toHaveLength(NOTIF_DEFS.length);
    expect(isEnabled(p, 'trade.opened')).toBe(true);
    expect(isEnabled(p, 'mkt.vol1h')).toBe(false);
    expect(p.quietHours).toBe(true);
  });

  it('порог отдаётся значением пресета, а не индексом', () => {
    // mkt.price1h по умолчанию стоит на третьем пресете — 3.5%.
    expect(thresholdOf(defaultPrefs(), 'mkt.price1h')).toBe(3.5);
  });

  it('у сигнала без порога thresholdOf отдаёт null', () => {
    expect(thresholdOf(defaultPrefs(), 'trade.opened')).toBeNull();
  });

  // Настройки хранятся как отклонения от дефолта: реестр может пополниться,
  // и сохранённый объект не должен решать за новые сигналы.
  it('mergePrefs накладывает сохранённое поверх дефолтов', () => {
    const p = mergePrefs({ items: { 'mkt.vol1h': { e: true, p: 2 } } });
    expect(isEnabled(p, 'mkt.vol1h')).toBe(true);
    expect(thresholdOf(p, 'mkt.vol1h')).toBe(3);
    expect(isEnabled(p, 'trade.opened')).toBe(true);
  });

  // Сигнал могли удалить из реестра, а строка в базе осталась. Панель, которая
  // на этом падает, оставляет человека без настроек вообще.
  it('mergePrefs игнорирует ключ, которого нет в реестре', () => {
    const p = mergePrefs({ items: { 'mkt.gone': { e: true, p: 0 } } });
    expect(Object.keys(p.items)).toHaveLength(NOTIF_DEFS.length);
    expect((p.items as Record<string, unknown>)['mkt.gone']).toBeUndefined();
  });

  it('mergePrefs переживает мусор вместо объекта', () => {
    expect(isEnabled(mergePrefs(null), 'trade.opened')).toBe(true);
    expect(isEnabled(mergePrefs('нет'), 'trade.opened')).toBe(true);
    expect(isEnabled(mergePrefs({ items: 7 }), 'trade.opened')).toBe(true);
  });

  it('индекс пресета за границами списка откатывается на дефолтный', () => {
    expect(thresholdOf(mergePrefs({ items: { 'mkt.price1h': { p: 99 } } }), 'mkt.price1h')).toBe(3.5);
  });

  it('togglePref переключает и не трогает соседей', () => {
    const p = togglePref(defaultPrefs(), 'mkt.vol1h');
    expect(isEnabled(p, 'mkt.vol1h')).toBe(true);
    expect(isEnabled(p, 'mkt.volume')).toBe(false);
    expect(isEnabled(togglePref(p, 'mkt.vol1h'), 'mkt.vol1h')).toBe(false);
  });

  it('cyclePreset идёт по кругу', () => {
    // mkt.vol1h: ×1.5 → ×2 → ×3 → ×1.5
    let p = mergePrefs({ items: { 'mkt.vol1h': { p: 0 } } });
    p = cyclePreset(p, 'mkt.vol1h');
    expect(thresholdOf(p, 'mkt.vol1h')).toBe(2);
    p = cyclePreset(p, 'mkt.vol1h');
    expect(thresholdOf(p, 'mkt.vol1h')).toBe(3);
    p = cyclePreset(p, 'mkt.vol1h');
    expect(thresholdOf(p, 'mkt.vol1h')).toBe(1.5);
  });

  it('cyclePreset ничего не делает сигналу без порога', () => {
    const p = cyclePreset(defaultPrefs(), 'trade.opened');
    expect(thresholdOf(p, 'trade.opened')).toBeNull();
  });

  // Хранить полную копию дефолтов значило бы заморозить их в базе: правка
  // дефолта в коде не доехала бы ни до кого из уже привязанных.
  it('toStored пишет только отклонения от дефолта', () => {
    expect(toStored(defaultPrefs())).toEqual({ items: {} });
    expect(toStored(togglePref(defaultPrefs(), 'mkt.vol1h'))).toEqual({
      items: { 'mkt.vol1h': { e: true } },
    });
  });

  it('toStored пишет quietHours, только когда он выключен', () => {
    const p = defaultPrefs();
    expect(toStored(p).quietHours).toBeUndefined();
    expect(toStored({ ...p, quietHours: false })).toMatchObject({ quietHours: false });
  });

  it('mergePrefs(toStored(p)) возвращает то же самое', () => {
    const p = cyclePreset(togglePref(defaultPrefs(), 'mkt.book'), 'mkt.ls');
    expect(mergePrefs(toStored(p))).toEqual(p);
  });
});
