import { describe, expect, it } from 'vitest';
import { getClientTerminalHint, parseTerminalHint } from './access-hint';

describe('parseTerminalHint', () => {
  it('без куки терминала нет — это вид шапки у большинства', () => {
    expect(parseTerminalHint(undefined)).toBe(false);
    expect(parseTerminalHint(null)).toBe(false);
  });

  it('«1» — терминал был доступен при последнем ответе', () => {
    expect(parseTerminalHint('1')).toBe(true);
  });

  it('любое другое значение не открывает пункт', () => {
    expect(parseTerminalHint('0')).toBe(false);
    expect(parseTerminalHint('true')).toBe(false);
    expect(parseTerminalHint('')).toBe(false);
  });
});

describe('getClientTerminalHint', () => {
  it('находит куку среди прочих', () => {
    expect(getClientTerminalHint('virex-locale=en; virex-terminal=1; virex-theme=light')).toBe(true);
  });

  it('нет куки — нет пункта', () => {
    expect(getClientTerminalHint('')).toBe(false);
    expect(getClientTerminalHint('virex-theme=light')).toBe(false);
  });

  it('стёртая кука (пустое значение) читается как «нет»', () => {
    expect(getClientTerminalHint('virex-terminal=; virex-theme=light')).toBe(false);
  });
});
