import { Armchair, Crown, Gift, MessageCircle, ShoppingBag, Skull, Swords, type LucideIcon } from 'lucide-react';
import type { Mode, RunCard, StationKind } from './model/types';

/** Подписи игры — одни на все экраны. */
export const MODE_LABEL: Record<Mode, string> = {
  recognize: 'Узнать',
  listen: 'Услышать',
  recall: 'Вспомнить',
  speak: 'Сказать',
  order: 'Собрать',
  dictate: 'Записать',
};

export const MODE_HINT: Record<Mode, string> = {
  recognize: 'слово → перевод',
  listen: 'на слух → перевод',
  recall: 'перевод → ввести',
  speak: 'перевод → вслух',
  order: 'собрать фразу',
  dictate: 'записать услышанное',
};

export const STATION: Record<StationKind, { label: string; icon: LucideIcon }> = {
  fight: { label: 'Бой', icon: Swords },
  elite: { label: 'Элита', icon: Skull },
  scene: { label: 'Сцена', icon: MessageCircle },
  shop: { label: 'Лавка', icon: ShoppingBag },
  rest: { label: 'Скамейка', icon: Armchair },
  find: { label: 'Находка', icon: Gift },
  boss: { label: 'Хранитель', icon: Crown },
};

/** Метка слова до удара — по ней решают, рисковать ли трудным ударом. */
export function tagOf(card: RunCard, via: 'deck' | 'intro' | 'mistake' | null): string {
  if (via === 'mistake') return 'ошибка в этом забеге';
  switch (card.tag) {
    case 'new':
      return 'новое слово';
    case 'due':
      return card.overdueDays > 0 ? `повтор · просрочено ${card.overdueDays} дн.` : 'повтор';
    case 'learning':
      return 'в изучении';
    case 'ahead':
      return 'впрок';
    case 'filler':
      return 'для разминки';
  }
}

/** «1 шиллинг», «3 шиллинга», «5 шиллингов». */
export function shillings(n: number): string {
  const m100 = n % 100;
  const m10 = n % 10;
  const word = m100 > 10 && m100 < 20 ? 'шиллингов' : m10 === 1 ? 'шиллинг' : m10 >= 2 && m10 <= 4 ? 'шиллинга' : 'шиллингов';
  return `${n} ${word}`;
}
