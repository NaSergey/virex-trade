import { describe, expect, it, vi } from 'vitest';
import { Pad } from './pad';

describe('Pad', () => {
  it('сообщает только о переменах и отпускает всё разом', () => {
    const seen = vi.fn();
    const pad = new Pad(seen);
    pad.set('left', true);
    pad.set('left', true);
    pad.set('brake', true);
    expect(seen).toHaveBeenCalledTimes(2);
    expect(pad.input).toEqual({ left: true, right: false, brake: true });
    pad.release();
    expect(pad.input).toEqual({ left: false, right: false, brake: false });
  });
});
