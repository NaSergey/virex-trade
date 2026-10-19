import type { Input } from '@/entities/race';

export type PadKey = 'left' | 'right' | 'brake';

/** Нажатия с клавиатуры и сенсорных кнопок — одно состояние, сообщается только перемена. */
export class Pad {
  private st: Input = { left: false, right: false, brake: false };

  private onChange: (input: Input) => void;

  constructor(onChange: (input: Input) => void = () => undefined) {
    this.onChange = onChange;
  }

  /** Кому сообщать о переменах: ставит страница в эффекте — там известна отправка. */
  listen(fn: (input: Input) => void) {
    this.onChange = fn;
  }

  get input(): Input {
    return this.st;
  }

  set(k: PadKey, v: boolean) {
    if (this.st[k] === v) return;
    this.st = { ...this.st, [k]: v };
    this.onChange(this.st);
  }

  release() {
    this.set('left', false);
    this.set('right', false);
    this.set('brake', false);
  }
}
