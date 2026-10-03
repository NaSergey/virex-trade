interface Slot<T> {
  version: number;
  /** Когда начато чтение — от него и срок: возраст данных считается с запроса, а не с ответа. */
  at: number;
  value?: T;
  inflight?: Promise<T>;
}

/** Сколько записей держать, прежде чем выметать протухшие. */
const SWEEP_ABOVE = 500;

/**
 * Снимок счёта терминала на пользователя: один запрос к бирже на все его
 * вкладки и на всё, что пришло за несколько секунд.
 *
 * Зачем: каждая открытая вкладка терминала опрашивает счёт раз в 3 секунды, и
 * в фоне тоже, а снимок — три приватных запроса к Bybit. Лимит Bybit — на IP
 * сервера, общий для всех пользователей и для синка (`bybit/bybit-gate.ts`):
 * две вкладки одного человека не должны стоить вдвое.
 *
 * `version` — сколько раз этот ключ что-то менял на бирже
 * (`BybitTerminalClient.writeVersion`). Снимок годен, только пока версия не
 * сдвинулась: после ордера, правки уровня или закрытия следующий опрос идёт на
 * биржу, а не показывает счёт до действия. Чтение, начатое до записи и
 * закончившееся после, в кэш не кладётся — его слот к тому времени уже
 * заменён. Сбрасывать кэш руками в каждом методе, меняющем счёт, не нужно, и
 * новый такой метод не сможет об этом забыть.
 *
 * Ошибка не кэшируется: следующий вызов спросит биржу снова.
 */
export class StateCache<T> {
  private readonly slots = new Map<string, Slot<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string, version: number, load: () => Promise<T>): Promise<T> {
    const now = this.now();
    const slot = this.slots.get(key);
    if (slot && slot.version === version) {
      if (slot.value !== undefined && now - slot.at < this.ttlMs) return Promise.resolve(slot.value);
      if (slot.inflight) return slot.inflight;
    }
    if (this.slots.size > SWEEP_ABOVE) this.sweep(now);

    const fresh: Slot<T> = { version, at: now };
    fresh.inflight = load().then(
      (value) => {
        if (this.slots.get(key) === fresh) {
          fresh.value = value;
          fresh.inflight = undefined;
        }
        return value;
      },
      (err) => {
        if (this.slots.get(key) === fresh) this.slots.delete(key);
        throw err;
      },
    );
    this.slots.set(key, fresh);
    return fresh.inflight;
  }

  /** Только для тестов. */
  get size(): number {
    return this.slots.size;
  }

  private sweep(now: number): void {
    for (const [key, slot] of this.slots) {
      if (!slot.inflight && now - slot.at >= this.ttlMs) this.slots.delete(key);
    }
  }
}
