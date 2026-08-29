import { chunkBySpan } from './trade-context.service';

describe('chunkBySpan', () => {
  it('пустой список — пустой результат', () => {
    expect(chunkBySpan<{ e: number; c: number }>([], (i) => i.e, (i) => i.c, 100)).toEqual([]);
  });

  it('один кусок, если весь охват укладывается в maxSpanMs', () => {
    const items = [
      { e: 0, c: 10 },
      { e: 50, c: 60 },
      { e: 90, c: 100 },
    ];
    const chunks = chunkBySpan(items, (i) => i.e, (i) => i.c, 100);
    expect(chunks).toEqual([items]);
  });

  it('делит на несколько кусков, если охват превышает maxSpanMs', () => {
    // maxSpanMs=100. [0,10] и [20,30] — от начала куска (0) охват 30<=100,
    // оба в одном куске. [500,510] — от того же начала охват 510>100, новый кусок.
    const items = [
      { e: 0, c: 10 },
      { e: 20, c: 30 },
      { e: 500, c: 510 },
    ];
    const chunks = chunkBySpan(items, (i) => i.e, (i) => i.c, 100);
    expect(chunks).toEqual([
      [
        { e: 0, c: 10 },
        { e: 20, c: 30 },
      ],
      [{ e: 500, c: 510 }],
    ]);
  });

  it('сортирует по entryMs перед разбиением — порядок на входе не важен', () => {
    const items = [
      { e: 20, c: 30 },
      { e: 0, c: 10 },
    ];
    const chunks = chunkBySpan(items, (i) => i.e, (i) => i.c, 100);
    expect(chunks).toEqual([
      [
        { e: 0, c: 10 },
        { e: 20, c: 30 },
      ],
    ]);
  });

  it('каждый следующий кусок начинает отсчёт заново от своего первого элемента', () => {
    // maxSpanMs=100. Три элемента по 150 друг от друга: [0,10], [150,160], [300,310].
    // Кусок 1 стартует в 0: [150,160] даёт охват 160>100 → новый кусок.
    // Кусок 2 стартует в 150: [300,310] даёт охват от 150 = 160>100 → ещё один.
    const items = [
      { e: 0, c: 10 },
      { e: 150, c: 160 },
      { e: 300, c: 310 },
    ];
    const chunks = chunkBySpan(items, (i) => i.e, (i) => i.c, 100);
    expect(chunks).toEqual([[{ e: 0, c: 10 }], [{ e: 150, c: 160 }], [{ e: 300, c: 310 }]]);
  });
});
