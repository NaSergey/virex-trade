import {
  alertText,
  newPositions,
  parseSeen,
  seenOf,
  STALE_GAP_MIN,
} from './hl-position-watch';
import type { HlPosition } from './positions';

const pos = (over: Partial<HlPosition> = {}): HlPosition => ({
  address: '0xabcdef0123456789abcdef0123456789abcdef01',
  coin: 'BTC',
  side: 'long',
  size: 1,
  notional: 100_000,
  entryPx: 98_450,
  markPx: 100_000,
  unrealizedPnl: 0,
  leverage: 10,
  liquidationPx: null,
  ...over,
});

describe('newPositions', () => {
  it('базовой проверки не было — молчит, как бы много ни держал', () => {
    expect(newPositions(null, [pos(), pos({ coin: 'ETH' })])).toEqual([]);
  });

  it('позиция, которая уже была, не новая', () => {
    expect(
      newPositions([{ coin: 'BTC', side: 'long' }], [pos()]),
    ).toEqual([]);
  });

  it('новая монета — взятие', () => {
    const eth = pos({ coin: 'ETH' });
    expect(newPositions([{ coin: 'BTC', side: 'long' }], [pos(), eth])).toEqual(
      [eth],
    );
  });

  it('переворот лонга в шорт — взятие: сторона новая', () => {
    const short = pos({ side: 'short' });
    expect(newPositions([{ coin: 'BTC', side: 'long' }], [short])).toEqual([
      short,
    ]);
  });

  it('закрытие и добор уведомлений не дают', () => {
    expect(newPositions([{ coin: 'BTC', side: 'long' }], [])).toEqual([]);
    expect(
      newPositions([{ coin: 'BTC', side: 'long' }], [pos({ size: 5 })]),
    ).toEqual([]);
  });

  it('пустой список — это «позиций не было», а не «проверки не было»', () => {
    const btc = pos();
    expect(newPositions([], [btc])).toEqual([btc]);
  });
});

describe('parseSeen', () => {
  it('нет состояния или оно не той формы — базовой проверки не было', () => {
    expect(parseSeen(null)).toBeNull();
    expect(parseSeen('x')).toBeNull();
    expect(parseSeen({ at: 'вчера', positions: [] })).toBeNull();
    expect(parseSeen({ at: 1, positions: 'BTC' })).toBeNull();
  });

  it('читает то, что записал seenOf, и выбрасывает битые строки позиций', () => {
    expect(parseSeen(seenOf(5, [pos()]))).toEqual({
      at: 5,
      positions: [{ coin: 'BTC', side: 'long' }],
    });
    expect(
      parseSeen({
        at: 5,
        positions: [{ coin: 'BTC', side: 'long' }, { coin: 'X' }, null],
      }),
    ).toEqual({ at: 5, positions: [{ coin: 'BTC', side: 'long' }] });
  });
});

describe('seenOf', () => {
  it('запоминает только монету и сторону', () => {
    expect(seenOf(1234, [pos(), pos({ coin: 'ETH', side: 'short' })])).toEqual({
      at: 1234,
      positions: [
        { coin: 'BTC', side: 'long' },
        { coin: 'ETH', side: 'short' },
      ],
    });
  });
});

describe('alertText', () => {
  const address = '0xabcdef0123456789abcdef0123456789abcdef01';

  it('заметка, ссылка на профиль и строка на позицию', () => {
    const t = alertText({
      address,
      note: 'Тихий шортист',
      positions: [pos({ side: 'short', notional: 1_250_000, entryPx: 98_450.5 })],
      gapMin: 1,
    });
    expect(t).toContain('Тихий шортист');
    expect(t).toContain(`https://hyperdash.info/trader/${address}`);
    expect(t).toContain('BTC · шорт · $1 250 000 · вход 98 450.5 · плечо 10x');
    expect(t).not.toContain('Проверка стояла');
  });

  it('без заметки — короткий адрес', () => {
    const t = alertText({ address, note: null, positions: [pos()], gapMin: 1 });
    expect(t).toContain('0xabcd…ef01');
  });

  it('экранирует HTML в заметке: Telegram разбирает разметку', () => {
    const t = alertText({
      address,
      note: '<b>x</b> & y',
      positions: [pos()],
      gapMin: 1,
    });
    expect(t).toContain('&lt;b&gt;x&lt;/b&gt; &amp; y');
    expect(t).not.toContain('<b>x</b>');
  });

  it('несколько позиций — по строке на каждую, одним сообщением', () => {
    const t = alertText({
      address,
      note: null,
      positions: [pos(), pos({ coin: 'ETH', side: 'short', notional: 5000 })],
      gapMin: 1,
    });
    expect(t).toContain('BTC · лонг');
    expect(t).toContain('ETH · шорт · $5 000');
  });

  it('проверка стояла дольше порога — честная оговорка со временем', () => {
    const t = alertText({
      address,
      note: null,
      positions: [pos()],
      gapMin: STALE_GAP_MIN + 25,
    });
    expect(t).toContain(`Проверка стояла ${STALE_GAP_MIN + 25} мин`);
  });

  it('дешёвая монета — цена с значащими знаками, а не «0»', () => {
    const t = alertText({
      address,
      note: null,
      positions: [pos({ coin: 'PEPE', entryPx: 0.0000123456 })],
      gapMin: 1,
    });
    expect(t).toContain('вход 0.000012346');
  });

  it('нет цены входа и плеча — строка не ломается', () => {
    const t = alertText({
      address,
      note: null,
      positions: [pos({ entryPx: null, leverage: 0 })],
      gapMin: 1,
    });
    expect(t).toContain('BTC · лонг · $100 000');
    expect(t).not.toContain('вход');
    expect(t).not.toContain('плечо');
  });
});
