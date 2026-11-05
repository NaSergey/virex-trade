/**
 * Условия партии — какая это зима. Разыгрываются на старте и меняют правила всей игры: в холодную
 * зиму вода замерзает и костёр съедает дерево, в голодный год мало зверя, рядом с войной
 * разбойники приходят раньше и сильнее. Название — по-английски, на экране всю партию.
 */

export type CondId = 'calm' | 'cold' | 'hunger' | 'war' | 'wolves';

export interface CondDef {
  name: string;
  text: string;
  ru: string;
}

export const CONDS: Record<CondId, CondDef> = {
  calm: {
    name: 'A quiet winter',
    text: 'A quiet winter. It is cold, but not too cold.',
    ru: 'Тихая зима. Холодно, но не слишком.',
  },
  cold: {
    name: 'A cold winter',
    text: 'A very cold winter. Water turns to ice, and the fire needs wood every night.',
    ru: 'Очень холодная зима. Вода замерзает, а костру каждую ночь нужно дерево.',
  },
  hunger: {
    name: 'A hungry year',
    text: 'A hungry year. There are few animals in the forest, and we have little food.',
    ru: 'Голодный год. В лесу мало зверя, и еды у нас мало.',
  },
  war: {
    name: 'War is near',
    text: 'War is near. Bandits come early, and they are strong.',
    ru: 'Рядом война. Разбойники приходят рано, и они сильные.',
  },
  wolves: {
    name: 'The wolf winter',
    text: 'The wolf winter. The wolves are hungry, and they come often.',
    ru: 'Волчья зима. Волки голодны и приходят часто.',
  },
};

export const COND_IDS = Object.keys(CONDS) as CondId[];
