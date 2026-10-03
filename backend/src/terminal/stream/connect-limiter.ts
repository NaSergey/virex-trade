/**
 * Скользящее окно новых соединений. Bybit пускает не больше 500 новых
 * WebSocket-соединений за 5 минут; ограничитель держит процесс ниже, а лишнее
 * соединение просто откладывается до следующего прохода.
 */
export class ConnectLimiter {
  private readonly taken: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  tryTake(now: number): boolean {
    while (this.taken.length > 0 && this.taken[0] <= now - this.windowMs) this.taken.shift();
    if (this.taken.length >= this.limit) return false;
    this.taken.push(now);
    return true;
  }
}
