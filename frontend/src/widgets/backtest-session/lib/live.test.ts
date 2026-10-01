import { describe, expect, it } from 'vitest';
import { liveAnchor, mergeMinutes, mergeTagged, ofSymbol } from './live';

const MIN = 60_000;
const T = Date.UTC(2026, 8, 19, 12, 0, 0);
const c = (t: number, close: number) => ({ t, o: close, h: close, l: close, c: close });

/**
 * В эфире минутки приходят хвостом раз в две секунды, и последняя из них ещё
 * формируется: та же минутка прилетает снова и снова с новой ценой. Слияние
 * обязано её замещать, а не дописывать — иначе график получит десятки свечей
 * на одну минуту.
 */
describe('mergeMinutes', () => {
  it('свежая версия той же минутки замещает прежнюю', () => {
    const prev = [c(T, 100), c(T + MIN, 101)];

    const next = mergeMinutes(prev, [c(T + MIN, 105)]);

    expect(next).toHaveLength(2);
    expect(next[1]).toEqual(c(T + MIN, 105));
  });

  it('новые минутки дописываются в конец', () => {
    const next = mergeMinutes([c(T, 100)], [c(T + MIN, 101), c(T + 2 * MIN, 102)]);

    expect(next.map((m) => m.t)).toEqual([T, T + MIN, T + 2 * MIN]);
  });

  it('разрыв не заполняется выдуманными свечами — дыра видна как дыра', () => {
    // Вкладка спала: между загруженным и хвостом пропущено несколько минут.
    const next = mergeMinutes([c(T, 100)], [c(T + 5 * MIN, 130)]);

    expect(next.map((m) => m.t)).toEqual([T, T + 5 * MIN]);
  });

  it('порядок по времени, даже если хвост пришёл вперемешку', () => {
    const next = mergeMinutes([c(T + MIN, 101)], [c(T + 2 * MIN, 102), c(T, 100)]);

    expect(next.map((m) => m.t)).toEqual([T, T + MIN, T + 2 * MIN]);
  });

  it('пустой хвост ничего не меняет', () => {
    const prev = [c(T, 100)];
    expect(mergeMinutes(prev, [])).toEqual(prev);
  });
});

/**
 * Якорь — граница, правее которой свечи таймфрейма собираются из минуток, а не
 * берутся из хранилища. Он идёт от конца последней СОХРАНЁННОЙ свечи, а не от
 * начала текущей: синк свечей отстаёт от биржи, и между хранилищем и текущей
 * свечой иначе оставалась бы дыра.
 */
describe('liveAnchor', () => {
  it('без сохранённых свечей собираем из минуток начало текущей свечи', () => {
    const now = T + 30_000;
    expect(liveAnchor([], 60, now)).toBe(Date.UTC(2026, 8, 19, 12, 0, 0));
  });

  it('якорь — конец последней сохранённой свечи', () => {
    const hourAgo = Date.UTC(2026, 8, 19, 11, 0, 0);
    expect(liveAnchor([c(hourAgo, 100)], 60, T + 30_000)).toBe(hourAgo + 60 * MIN);
  });

  it('отставший синк не оставляет дыры: якорь раньше начала текущей свечи', () => {
    // Последняя сохранённая часовая свеча — трёхчасовой давности.
    const stale = Date.UTC(2026, 8, 19, 9, 0, 0);
    const anchor = liveAnchor([c(stale, 100)], 60, T + 30_000);

    expect(anchor).toBe(stale + 60 * MIN);
    expect(anchor).toBeLessThan(Date.UTC(2026, 8, 19, 12, 0, 0));
  });

  it('якорь не уезжает правее начала текущей свечи', () => {
    // Хранилище почему-то содержит свечу, которая ещё не должна была закрыться.
    const current = Date.UTC(2026, 8, 19, 12, 0, 0);
    expect(liveAnchor([c(current, 100)], 60, T + 30_000)).toBe(current);
  });
});

/**
 * Лента эфира переключается между монетами: ответ, пришедший по прежней монете
 * уже после переключения, не должен лечь свечами на график новой.
 */
describe('минутки, помеченные монетой', () => {
  it('слияние в ту же монету дописывает', () => {
    const next = mergeTagged({ symbol: 'ETHUSDT', rows: [c(T, 100)] }, 'ETHUSDT', [c(T + MIN, 101)]);

    expect(next).toEqual({ symbol: 'ETHUSDT', rows: [c(T, 100), c(T + MIN, 101)] });
  });

  it('слияние в другую монету начинает с чистого листа', () => {
    const next = mergeTagged({ symbol: 'BTCUSDT', rows: [c(T, 70_000)] }, 'ETHUSDT', [c(T + MIN, 2_500)]);

    expect(next).toEqual({ symbol: 'ETHUSDT', rows: [c(T + MIN, 2_500)] });
  });

  it('чужая монета читается как пусто', () => {
    const state = { symbol: 'BTCUSDT', rows: [c(T, 70_000)] };

    expect(ofSymbol(state, 'ETHUSDT')).toBeNull();
    expect(ofSymbol(state, 'BTCUSDT')).toBe(state);
    expect(ofSymbol(null, 'BTCUSDT')).toBeNull();
  });
});
