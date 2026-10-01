/**
 * Порядок строк общей таблицы турниров (решение владельца 2026-09-26): сначала
 * созданные мной, потом те, где я играю, потом чужие. Внутри группы — что
 * идёт, что набирает, что кончилось; внутри состояния — свежие сверху.
 *
 * Своё — первым, потому что к нему возвращаются: за своим лобби следят, пока
 * оно набирается, а в свой идущий турнир заходят торговать. Чужое ниже — это
 * ответ на «куда ещё войти или за чем посмотреть».
 */

export type BoardRelation = 'created' | 'joined' | 'other';

const RELATION_RANK: Record<BoardRelation, number> = { created: 0, joined: 1, other: 2 };
const STATUS_RANK: Record<string, number> = { running: 0, lobby: 1, finished: 2, cancelled: 3 };

export function boardOrder<T extends { relation: BoardRelation; status: string; createdAt: Date }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      RELATION_RANK[a.relation] - RELATION_RANK[b.relation] ||
      (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  );
}
