import type { RelicId, UnlockId } from './relics';

/** Персонаж — стартовый набор: здоровье, находка и одна особенность. */
export type CharacterId = 'tourist' | 'student' | 'announcer' | 'reporter';

export interface CharacterDef {
  name: string;
  hp: number;
  relic: RelicId;
  perk: string;
  unlock: UnlockId | null;
  speech?: true;
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  tourist: { name: 'Турист', hp: 30, relic: 'umbrella', perk: 'без особенностей', unlock: null },
  student: { name: 'Студент', hp: 26, relic: 'notebook', perk: 'урон по хранителю +50 %', unlock: 'bossBeaten' },
  announcer: {
    name: 'Диктор',
    hp: 28,
    relic: 'megaphone',
    perk: '«Узнать» на 1 слабее',
    unlock: 'voice30',
    speech: true,
  },
  reporter: { name: 'Репортёр', hp: 28, relic: 'guide', perk: 'сцены дают на 50 % больше шиллингов', unlock: 'scenes5' },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];
