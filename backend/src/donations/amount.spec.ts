import {
  BASE_GRANULARITY_UNITS,
  candidateAmounts,
  formatUsdt,
  MAX_TAIL_UNITS,
  parseUsdtAmount,
  TAIL_SLOTS,
  TAIL_STEP_UNITS,
} from './amount';
import { isTronAddress, MAINNET_USDT_CONTRACT } from './donation.config';

describe('parseUsdtAmount', () => {
  it('переводит сумму в минимальные единицы', () => {
    expect(parseUsdtAmount('5')).toBe(5_000_000n);
    expect(parseUsdtAmount('5.5')).toBe(5_500_000n);
    expect(parseUsdtAmount('0.01')).toBe(10_000n);
  });

  it('не принимает больше двух знаков после запятой', () => {
    // Младшие знаки отданы уникальному хвосту. Пусти сюда 5.0137 — и введённая
    // человеком сумма столкнётся с хвостом чужого интента.
    expect(parseUsdtAmount('5.013')).toBeNull();
    expect(parseUsdtAmount('5.000001')).toBeNull();
  });

  it('не принимает мусор и отрицательные', () => {
    expect(parseUsdtAmount('')).toBeNull();
    expect(parseUsdtAmount('-5')).toBeNull();
    expect(parseUsdtAmount('5e3')).toBeNull();
    expect(parseUsdtAmount('abc')).toBeNull();
    expect(parseUsdtAmount('5.')).toBeNull();
  });

  it('не теряет точность на суммах, где ломается double', () => {
    // 0.07 в double — 0.07000000000000001; через целые единицы этого нет.
    expect(parseUsdtAmount('0.07')).toBe(70_000n);
    expect(parseUsdtAmount('1234567.89')).toBe(1_234_567_890_000n);
  });
});

describe('formatUsdt', () => {
  it('показывает минимум два знака и не тянет лишние нули', () => {
    expect(formatUsdt(5_000_000n)).toBe('5.00');
    expect(formatUsdt(5_013_700n)).toBe('5.0137');
    expect(formatUsdt(5_500_000n)).toBe('5.50');
    expect(formatUsdt(0n)).toBe('0.00');
  });

  it('обратим с parseUsdtAmount на суммах без хвоста', () => {
    for (const s of ['1.00', '5.50', '0.01', '9999999.99']) {
      expect(formatUsdt(parseUsdtAmount(s)!)).toBe(s);
    }
  });
});

describe('candidateAmounts', () => {
  it('даёт все хвосты ровно по разу', () => {
    const base = 5_000_000n;
    const all = candidateAmounts(base);
    expect(all).toHaveLength(TAIL_SLOTS);
    expect(new Set(all).size).toBe(TAIL_SLOTS);
  });

  it('хвост всегда положительный и не больше объявленной надбавки', () => {
    // Пользователю обещано, что сумма вырастет не более чем на MAX_TAIL_UNITS.
    const base = 5_000_000n;
    for (const amount of candidateAmounts(base)) {
      const tail = amount - base;
      expect(tail).toBeGreaterThanOrEqual(TAIL_STEP_UNITS);
      expect(tail).toBeLessThanOrEqual(MAX_TAIL_UNITS);
      expect(tail % TAIL_STEP_UNITS).toBe(0n);
    }
  });

  it('не задевает знаки, которые вводит человек', () => {
    // Хвост живёт строго ниже сотых: 5.50 + хвост никогда не дотянется до 5.51.
    // Иначе диапазоны разных введённых сумм пересеклись бы, и слоты одной
    // суммы отнимали бы слоты у другой.
    const base = 5_500_000n;
    for (const amount of candidateAmounts(base)) {
      expect(amount / BASE_GRANULARITY_UNITS).toBe(
        base / BASE_GRANULARITY_UNITS,
      );
    }
  });

  it('перемешивает — иначе очередь вырождается в линейный перебор', () => {
    const a = candidateAmounts(5_000_000n);
    const b = candidateAmounts(5_000_000n);
    expect(a).not.toEqual(b);
  });
});

describe('isTronAddress', () => {
  it('принимает реальные адреса основной сети', () => {
    expect(isTronAddress(MAINNET_USDT_CONTRACT)).toBe(true);
    // Кошелёк фонда TRON — публично известный валидный адрес.
    expect(isTronAddress('TZ4UXDV5ZhNW7fb2AMSbgfAEZ7hWsnYS2g')).toBe(true);
  });

  it('ловит опечатку в одном символе', () => {
    // Ровно ради этого адрес проверяется по контрольной сумме, а не по
    // «начинается на T и 34 символа»: опечатка в адресе означает деньги,
    // ушедшие в никуда.
    const broken = MAINNET_USDT_CONTRACT.slice(0, -1) + 'u';
    expect(isTronAddress(broken)).toBe(false);
  });

  it('отвергает всё, что не адрес TRON', () => {
    expect(isTronAddress('')).toBe(false);
    expect(isTronAddress('0x2170Ed0880ac9A755fd29B2688956BD959F933F8')).toBe(
      false,
    );
    expect(isTronAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6')).toBe(false); // 33 символа
    expect(isTronAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe(
      false,
    );
  });
});
