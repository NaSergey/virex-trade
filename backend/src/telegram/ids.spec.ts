import { packId, unpackId } from './ids';

const UUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

describe('packId', () => {
  it('сжимает uuid до 22 символов', () => {
    expect(packId(UUID)).toHaveLength(22);
  });

  it('распаковка возвращает исходный uuid', () => {
    expect(unpackId(packId(UUID))).toBe(UUID);
  });

  // callback_data у Telegram ограничен 64 байтами, а кнопка тега закрытой
  // сделки несёт два uuid: в сыром виде это 76 байт и кнопка просто не уходит.
  it('кнопка тега закрытой сделки укладывается в 64 байта', () => {
    const data = `ct|${packId(UUID)}|${packId('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')}`;
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
  });

  it('мусор вместо короткого id даёт пустую строку, а не исключение', () => {
    expect(unpackId('не-id')).toBe('');
  });
});
