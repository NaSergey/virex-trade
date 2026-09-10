import {
  TIMEFRAMES,
  SYNC_ORDER,
  SYMBOL,
  START_MS,
  isValidTimeframe,
  timeframeMs,
  toBinanceInterval,
  isClosed,
} from './timeframes';

describe('timeframes', () => {
  it('перечисляет ровно шесть поддерживаемых таймфреймов, в минутах', () => {
    expect(TIMEFRAMES).toEqual([1, 5, 15, 60, 240, 1440]);
  });

  it('держит символ и начало истории константами', () => {
    expect(SYMBOL).toBe('BTCUSDT');
    expect(START_MS).toBe(Date.UTC(2018, 0, 1));
  });

  it('синкает от крупного к мелкому — дневной график появляется первым', () => {
    expect(SYNC_ORDER).toEqual([1440, 240, 60, 15, 5, 1]);
  });

  it('отвергает таймфрейм вне списка', () => {
    expect(isValidTimeframe(60)).toBe(true);
    expect(isValidTimeframe(30)).toBe(false);
    expect(isValidTimeframe(0)).toBe(false);
  });

  it('переводит минуты в интервал Binance', () => {
    expect(toBinanceInterval(1)).toBe('1m');
    expect(toBinanceInterval(5)).toBe('5m');
    expect(toBinanceInterval(15)).toBe('15m');
    expect(toBinanceInterval(60)).toBe('1h');
    expect(toBinanceInterval(240)).toBe('4h');
    expect(toBinanceInterval(1440)).toBe('1d');
  });

  it('падает на неизвестном таймфрейме, а не отдаёт undefined в URL', () => {
    expect(() => toBinanceInterval(30)).toThrow(/30/);
  });

  it('переводит таймфрейм в миллисекунды', () => {
    expect(timeframeMs(1)).toBe(60_000);
    expect(timeframeMs(240)).toBe(14_400_000);
  });

  // Главный тест файла. Ошибка здесь даёт вечно недорисованную последнюю
  // свечу на графике — она не падает, её надо заметить глазами.
  it('считает 4h-свечу закрытой ровно в момент закрытия, не раньше', () => {
    const open = Date.UTC(2026, 0, 1, 12, 0, 0);
    const closesAt = Date.UTC(2026, 0, 1, 16, 0, 0);
    expect(isClosed(open, 240, closesAt - 1)).toBe(false);
    expect(isClosed(open, 240, closesAt)).toBe(true);
  });

  it('то же правило для минутки', () => {
    const open = Date.UTC(2026, 0, 1, 12, 0, 0);
    expect(isClosed(open, 1, open + 59_999)).toBe(false);
    expect(isClosed(open, 1, open + 60_000)).toBe(true);
  });
});
