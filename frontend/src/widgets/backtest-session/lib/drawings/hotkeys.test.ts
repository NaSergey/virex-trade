import { describe, expect, it } from 'vitest';
import { hotkeyOf, toolShortcut } from './hotkeys';

const key = (code: string, mods: Partial<Record<'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey', boolean>> = {}, k = '') => ({
  code,
  key: k,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe('hotkeyOf', () => {
  it('Alt+буква берёт инструмент по физической клавише', () => {
    expect(hotkeyOf(key('KeyT', { altKey: true }, 'е'))).toEqual({ type: 'tool', tool: 'trend' });
    expect(hotkeyOf(key('KeyJ', { altKey: true }))).toEqual({ type: 'tool', tool: 'hray' });
  });
  it('прямоугольник — только с Shift, Alt+R без него не инструмент', () => {
    expect(hotkeyOf(key('KeyR', { altKey: true, shiftKey: true }))).toEqual({ type: 'tool', tool: 'rect' });
    expect(hotkeyOf(key('KeyR', { altKey: true }))).toBeNull();
  });
  it('отмена и повтор — Ctrl и ⌘', () => {
    expect(hotkeyOf(key('KeyZ', { ctrlKey: true }))).toEqual({ type: 'undo' });
    expect(hotkeyOf(key('KeyZ', { metaKey: true, shiftKey: true }))).toEqual({ type: 'redo' });
    expect(hotkeyOf(key('KeyY', { ctrlKey: true }))).toEqual({ type: 'redo' });
  });
  it('Ctrl+Alt+H прячет рисунки, а не берёт горизонталь', () => {
    expect(hotkeyOf(key('KeyH', { ctrlKey: true, altKey: true }))).toEqual({ type: 'hide' });
  });
  it('Delete без модификаторов', () => {
    expect(hotkeyOf(key('Delete', {}, 'Delete'))).toEqual({ type: 'delete' });
    expect(hotkeyOf(key('KeyT'))).toBeNull();
  });
});

describe('toolShortcut', () => {
  it('подписи', () => {
    expect(toolShortcut('trend')).toBe('Alt+T');
    expect(toolShortcut('rect')).toBe('Alt+Shift+R');
    expect(toolShortcut('brush')).toBeNull();
  });
});
