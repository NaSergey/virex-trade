import type { RankedParticipant } from './leaderboard';

/**
 * Итог командного турнира (решение владельца 2026-09-27).
 *
 * Результат команды — **средний** результат её игрока (эквити минус депозит):
 * по времени турнир стартует с теми, кто вошёл, и команды бывают разного
 * размера; сумма отдала бы победу большей команде числом, а не торговлей. У
 * равных команд победитель по среднему тот же, что и по сумме.
 *
 * Ничьей нет, как и в арене: равные средние разводит лучший игрок — побеждает
 * команда, чей игрок стоит выше в общем ранжировании (`rankParticipants`, где
 * места уже разведены временем входа).
 */
export function teamOutcome(
  ranked: RankedParticipant[],
  teamOf: Map<string, number>,
  startBalance: number,
): { winner: 0 | 1; averages: [number, number] } {
  const sums = [0, 0];
  const counts = [0, 0];
  for (const p of ranked) {
    const team = teamOf.get(p.userId);
    if (team !== 0 && team !== 1) continue;
    sums[team] += p.equity - startBalance;
    counts[team] += 1;
  }
  const averages: [number, number] = [
    counts[0] ? sums[0] / counts[0] : -Infinity,
    counts[1] ? sums[1] / counts[1] : -Infinity,
  ];
  if (averages[0] !== averages[1]) return { winner: averages[0] > averages[1] ? 0 : 1, averages };
  const best = ranked.find((p) => teamOf.get(p.userId) === 0 || teamOf.get(p.userId) === 1);
  // Игроков с командой не осталось вовсе (аккаунты удалены): победителя нет,
  // и выплачивать некому — падать финалу из-за этого нельзя.
  if (!best) return { winner: 0, averages };
  return { winner: teamOf.get(best.userId) as 0 | 1, averages };
}

/**
 * Фонд победившей команде поровну. Остаток от деления — лучшему в команде
 * (первому в `winnersByRank`): фонд обязан разойтись целиком, тем же правилом,
 * что у арены отдаёт остаток первому месту.
 */
export function teamPrizes(pool: number, winnersByRank: string[]): Map<string, number> {
  const share = winnersByRank.length ? Math.floor(pool / winnersByRank.length) : 0;
  const prizes = new Map(winnersByRank.map((id) => [id, share]));
  if (winnersByRank.length) {
    prizes.set(winnersByRank[0], share + (pool - share * winnersByRank.length));
  }
  return prizes;
}
