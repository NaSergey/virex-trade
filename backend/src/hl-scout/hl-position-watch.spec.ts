import {
  alertText,
  closedPositions,
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
    expect(newPositions([{ coin: 'BTC', side: 'long' }], [pos()])).toEqual([]);
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

  it('закрытие и добор взятием не считаются', () => {
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

describe('closedPositions', () => {
  it('базовой проверки не было — молчит', () => {
    expect(closedPositions(null, [])).toEqual([]);
  });

  it('пропавшая пара — закрытие, оставшаяся и добранная — нет', () => {
    const btc = { coin: 'BTC', side: 'long' as const };
    const eth = { coin: 'ETH', side: 'short' as const };
    expect(closedPositions([btc, eth], [pos({ size: 5 })])).toEqual([eth]);
  });

  it('переворот: лонг закрыт, шорт — новая позиция', () => {
    const btc = { coin: 'BTC', side: 'long' as const };
    expect(closedPositions([btc], [pos({ side: 'short' })])).toEqual([btc]);
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
    expect(parseSeen(seenOf(5, [pos()]))).toEqual(seenOf(5, [pos()]));
    expect(
      parseSeen({
        at: 5,
        positions: [{ coin: 'BTC', side: 'long' }, { coin: 'X' }, null],
      }),
    ).toEqual({ at: 5, positions: [{ coin: 'BTC', side: 'long' }] });
  });
});

describe('seenOf', () => {
  it('запоминает монету, сторону и то, что нужно сообщению о закрытии', () => {
    expect(seenOf(1234, [pos(), pos({ coin: 'ETH', side: 'short' })])).toEqual({
      at: 1234,
      positions: [
        {
          coin: 'BTC',
          side: 'long',
          notional: 100_000,
          entryPx: 98_450,
          leverage: 10,
        },
        {
          coin: 'ETH',
          side: 'short',
          notional: 100_000,
          entryPx: 98_450,
          leverage: 10,
        },
      ],
    });
  });

  it('состояние прежней формы (только монета и сторона) читается', () => {
    expect(
      parseSeen({ at: 1, positions: [{ coin: 'BTC', side: 'long' }] }),
    ).toEqual({ at: 1, positions: [{ coin: 'BTC', side: 'long' }] });
  });
});

describe('alertText', () => {
  const address = '0xabcdef0123456789abcdef0123456789abcdef01';

  it('заметка, ссылка на профиль и строка на позицию', () => {
    const t = alertText({
      address,
      note: 'Тихий шортист',
      positions: [
        pos({ side: 'short', notional: 1_250_000, entryPx: 98_450.5 }),
      ],
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

  it('закрытие: строка с тем, что было, без выдуманного результата', () => {
    const t = alertText({
      address,
      note: 'Кит',
      positions: [],
      closed: [
        {
          coin: 'ETH',
          side: 'short',
          notional: 5000,
          entryPx: 3200,
          leverage: 4,
        },
      ],
      gapMin: 1,
    });
    expect(t).toContain('закрыл позицию');
    expect(t).toContain('ETH · шорт · был $5 000 · вход 3 200 · плечо 4x');
    expect(t).not.toContain('взял');
  });

  it('закрытие позиции из старого состояния — только монета и сторона', () => {
    const t = alertText({
      address,
      note: null,
      positions: [],
      closed: [{ coin: 'BTC', side: 'long' }],
      gapMin: 1,
    });
    expect(t).toContain('BTC · лонг');
    expect(t).not.toContain('был');
  });

  it('взял и закрыл — два блока в одном сообщении, оговорка про закрытие', () => {
    const t = alertText({
      address,
      note: null,
      positions: [pos({ side: 'short' })],
      closed: [{ coin: 'BTC', side: 'long' }],
      gapMin: STALE_GAP_MIN + 1,
    });
    expect(t).toContain('взял позицию');
    expect(t).toContain('закрыл позицию');
    expect(t.match(/Профиль/g)).toHaveLength(1);
  });

  it('оговорка о простое при закрытии говорит «закрыться»', () => {
    const t = alertText({
      address,
      note: null,
      positions: [],
      closed: [{ coin: 'BTC', side: 'long' }],
      gapMin: STALE_GAP_MIN + 1,
    });
    expect(t).toContain('могла закрыться раньше');
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
