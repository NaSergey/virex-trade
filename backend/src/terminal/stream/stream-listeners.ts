import type { StreamContext, StreamListener } from './stop-follow.service';

/**
 * Несколько слушателей потока счёта за одним токеном `STREAM_LISTENER`: стоп за
 * тейками и стоп после исполнения сетки входа. Сбой одного слушателя другому не
 * мешает: события идут каждому отдельно.
 */
export class StreamListeners implements StreamListener {
  constructor(private readonly listeners: StreamListener[]) {}

  async pinned(): Promise<string[]> {
    const all = await Promise.all(this.listeners.map((l) => l.pinned()));
    return [...new Set(all.flat())];
  }

  onEvent(userId: string, msg: { topic: string; data: unknown[] }, ctx: StreamContext): void {
    for (const l of this.listeners) this.safely(() => l.onEvent(userId, msg, ctx));
  }

  onSnapshot(userId: string, ctx: StreamContext): void {
    for (const l of this.listeners) this.safely(() => l.onSnapshot(userId, ctx));
  }

  onIdle(userId: string, ctx: StreamContext): void {
    for (const l of this.listeners) this.safely(() => l.onIdle(userId, ctx));
  }

  private safely(op: () => void): void {
    try {
      op();
    } catch {
      /* слушатель ведёт свою очередь и логирует сам; чужой сбой не должен остановить остальных */
    }
  }
}
