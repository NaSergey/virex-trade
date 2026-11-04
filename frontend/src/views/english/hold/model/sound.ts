import type { SoundName } from '../../game/model/types';
import type { HoldState } from './rules';

/**
 * Звук Ashen Hold — разница соседних состояний, а не колбэки кнопок (приём столов и терминала):
 * одна проверка покрывает приказ, бой, парирование, гостя и ночь. Играется один, самый важный
 * звук перехода. Ноты — синтезатор первой игры (`game/sound.ts`), выключатель у них общий.
 */
export function soundOf(prev: HoldState | null, next: HoldState | null): SoundName | null {
  if (!prev || !next) return null;
  if (!prev.outcome && next.outcome) return next.outcome === 'win' ? 'win' : 'lose';
  const pb = prev.battle;
  const nb = next.battle;
  if (pb && nb) {
    if (!pb.outcome && nb.outcome) return nb.outcome === 'won' ? 'win' : 'lose';
    const hp = (s: HoldState) => s.people.reduce((n, p) => n + Math.max(0, p.hp), 0);
    if (hp(next) < hp(prev)) return 'hurt';
    const foes = (b: typeof pb) => b.enemies.reduce((n, e) => n + e.hp, 0);
    if (foes(nb) < foes(pb)) return 'hit';
    const missed = (b: typeof pb) => b.last.filter((l) => l.includes('missed')).length;
    if (missed(nb) > missed(pb)) return 'crit';
  }
  if (next.stats.mistakes > prev.stats.mistakes) return 'wrong';
  if (prev.visitor && !next.visitor) {
    const total = (s: HoldState) => s.res.food + s.res.water + s.res.wood + s.res.iron;
    return total(next) > total(prev) ? 'coin' : total(next) < total(prev) ? 'hurt' : 'step';
  }
  if (next.stats.phrases > prev.stats.phrases) return 'step';
  if (next.day > prev.day) return 'heal';
  return null;
}
