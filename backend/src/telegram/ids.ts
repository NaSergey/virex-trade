/**
 * uuid в callback_data и обратно. Telegram даёт под callback_data 64 байта, а
 * пара «сделка + тег» в текстовом виде занимает 76 — кнопка просто не уходит.
 * base64url от шестнадцати байт даёт 22 символа вместо 36.
 */
const HEX32 = /^[0-9a-f]{32}$/i;

export const packId = (uuid: string): string =>
  Buffer.from(uuid.replace(/-/g, ''), 'hex').toString('base64url');

export const unpackId = (short: string): string => {
  let hex: string;
  try {
    hex = Buffer.from(short, 'base64url').toString('hex');
  } catch {
    return '';
  }
  if (!HEX32.test(hex)) return '';
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
};
