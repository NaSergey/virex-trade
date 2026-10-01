/**
 * Рейтинг игры — одна таблица на всех, кто доиграл хотя бы один торговый
 * турнир. Выводится агрегатом из мест участников, а не копится колонкой:
 * сохранённые очки пришлось бы пересчитывать задним числом при любой правке
 * правила, а правило — соглашение, а не факт о человеке.
 *
 * Очки за турнир — «участников минус место»: победитель турнира на десять
 * человек получает девять, последний — ноль. Размер турнира в цене победы
 * учтён намеренно: обыграть девятерых весомее, чем одного.
 *
 * У командного турнира правило то же по смыслу — «сколько соперников
 * обошёл»: победитель получает столько очков, сколько игроков в команде
 * соперника, проигравший — ноль. «Участников минус место» дало бы
 * проигравшему в 5×5 восемь очков за поражение.
 */
export interface RatingInput {
  tournamentId: string;
  userId: string;
  name: string;
  /** Место в завершённом турнире, с единицы; у команд — 1 победителям, 2 остальным. */
  place: number;
  /** Команда у командного турнира (0 — A, 1 — B); у арены — null. */
  team?: number | null;
}

export interface RatingRow {
  /** Место в рейтинге, с единицы. */
  place: number;
  userId: string;
  name: string;
  points: number;
  tournaments: number;
  wins: number;
}

/**
 * `limit` строк таблицы и отдельно строка смотрящего, если он в них не попал:
 * иначе человек за пятидесятым местом не увидел бы себя вовсе и не понял, что
 * рейтинг вообще про него.
 */
export function ratingRows(
  input: RatingInput[],
  viewerId: string,
  limit = 50,
): { rows: RatingRow[]; me: RatingRow | null } {
  // Сколько человек было в турнире — из самих строк: они и есть все его
  // участники, и второй источник этого числа мог бы с ними разойтись.
  const size = new Map<string, number>();
  for (const r of input) size.set(r.tournamentId, (size.get(r.tournamentId) ?? 0) + 1);
  // Состав команд — оттуда же: ключ «турнир|команда».
  const teamSize = new Map<string, number>();
  for (const r of input) {
    if (r.team == null) continue;
    const key = `${r.tournamentId}|${r.team}`;
    teamSize.set(key, (teamSize.get(key) ?? 0) + 1);
  }
  const pointsOf = (r: RatingInput) =>
    r.team == null
      ? (size.get(r.tournamentId) ?? 1) - r.place
      : r.place === 1
        ? (teamSize.get(`${r.tournamentId}|${1 - r.team}`) ?? 0)
        : 0;

  const byUser = new Map<string, { name: string; points: number; tournaments: number; wins: number }>();
  for (const r of input) {
    const acc = byUser.get(r.userId) ?? { name: r.name, points: 0, tournaments: 0, wins: 0 };
    acc.name = r.name;
    acc.points += pointsOf(r);
    acc.tournaments += 1;
    if (r.place === 1) acc.wins += 1;
    byUser.set(r.userId, acc);
  }

  const ranked: RatingRow[] = [...byUser.entries()]
    .map(([userId, acc]) => ({ place: 0, userId, ...acc }))
    // Очки, при равенстве — победы, дальше меньше турниров: те же очки за
    // меньшее число попыток стоят дороже. Имя — последний разводящий, чтобы
    // порядок не зависел от того, в каком порядке пришли строки.
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.wins - a.wins ||
        a.tournaments - b.tournaments ||
        a.name.localeCompare(b.name),
    )
    .map((r, i) => ({ ...r, place: i + 1 }));

  const rows = ranked.slice(0, limit);
  const me = ranked.find((r) => r.userId === viewerId);
  return { rows, me: me && me.place > limit ? me : null };
}
