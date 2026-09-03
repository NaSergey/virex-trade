import { createHash } from 'crypto';

/**
 * Настройки приёма донатов в USDT-TRC20 и разбор адреса TRON.
 *
 * Всё, что можно ошибиться при разворачивании, проверяется здесь один раз на
 * старте: адрес кошелька — по контрольной сумме base58check, а не «начинается
 * на T», суммы — на вменяемость границ. Опечатка в адресе означает деньги,
 * ушедшие в никуда, и узнать о ней из первого же доната поздно.
 */

/** USDT в TRON — 6 знаков после запятой (decimals контракта). */
export const USDT_DECIMALS = 6;
export const UNITS_PER_USDT = 1_000_000n;

/**
 * Контракт USDT в основной сети TRON. Захардкожен как значение по умолчанию:
 * это константа сети, а не настройка развёртывания. Переопределяется
 * переменной окружения только ради Nile/Shasta-тестнета.
 */
export const MAINNET_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

const B58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(input: string): Buffer | null {
  let num = 0n;
  for (const ch of input) {
    const idx = B58_ALPHABET.indexOf(ch);
    if (idx < 0) return null;
    num = num * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num % 256n));
    num /= 256n;
  }
  // Ведущие '1' в base58 — это ведущие нулевые байты.
  for (const ch of input) {
    if (ch !== '1') break;
    bytes.unshift(0);
  }
  return Buffer.from(bytes);
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest();

/**
 * Адрес TRON в base58check: 21 байт полезной нагрузки (первый — 0x41) плюс
 * 4 байта контрольной суммы (первые 4 байта двойного SHA-256).
 */
export function isTronAddress(address: string): boolean {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return false;
  const raw = base58Decode(address);
  if (!raw || raw.length !== 25 || raw[0] !== 0x41) return false;
  const checksum = sha256(sha256(raw.subarray(0, 21))).subarray(0, 4);
  return checksum.equals(raw.subarray(21));
}

const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export interface DonationConfig {
  /** Приём донатов включён: адрес задан и прошёл проверку контрольной суммы. */
  enabled: boolean;
  /** Единственный кошелёк проекта — все донаты идут прямо на него. */
  receivingAddress: string;
  usdtContract: string;
  apiUrl: string;
  apiKey: string | null;
  /** Окно оплаты, которое видит пользователь. */
  ttlMs: number;
  /**
   * Запас сверх окна, в течение которого сумма остаётся закреплённой за
   * интентом. Транзакция, отправленная на девятой минуте, становится
   * необратимой примерно через минуту — уже после истечения окна.
   */
  lateGraceMs: number;
  pollIntervalMs: number;
  minUnits: bigint;
  maxUnits: bigint;
  /** Сколько незакрытых интентов разрешено одному пользователю. */
  maxPendingPerUser: number;
  /** 'address' — голый адрес (совместимо со всем), 'tron-uri' — tron:…?amount=. */
  qrMode: 'address' | 'tron-uri';
}

export function loadDonationConfig(): DonationConfig {
  const receivingAddress = (process.env.DONATION_TRON_ADDRESS ?? '').trim();
  const usdtContract = (
    process.env.DONATION_USDT_CONTRACT ?? MAINNET_USDT_CONTRACT
  ).trim();
  const qrMode =
    process.env.DONATION_QR_MODE === 'tron-uri' ? 'tron-uri' : 'address';

  return {
    enabled: isTronAddress(receivingAddress) && isTronAddress(usdtContract),
    receivingAddress,
    usdtContract,
    apiUrl: (process.env.TRONGRID_API_URL ?? 'https://api.trongrid.io').replace(
      /\/+$/,
      '',
    ),
    apiKey: (process.env.TRONGRID_API_KEY ?? '').trim() || null,
    ttlMs: num('DONATION_TTL_MS', 10 * 60_000),
    lateGraceMs: num('DONATION_LATE_GRACE_MS', 20 * 60_000),
    pollIntervalMs: num('DONATION_POLL_INTERVAL_MS', 15_000),
    minUnits: BigInt(
      Math.round(num('DONATION_MIN_AMOUNT', 1) * Number(UNITS_PER_USDT)),
    ),
    maxUnits: BigInt(
      Math.round(num('DONATION_MAX_AMOUNT', 10_000) * Number(UNITS_PER_USDT)),
    ),
    maxPendingPerUser: Math.floor(num('DONATION_MAX_PENDING_PER_USER', 3)),
    qrMode,
  };
}

export const DONATION_CONFIG = 'DONATION_CONFIG';
