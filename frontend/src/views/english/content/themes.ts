/**
 * Темы общего словаря — разговорные ситуации, по которым слово пригодится.
 * У слова учебника тема — его юнит, у общего словаря — одна из этих, свои темы
 * владелец заводит сам (`english_themes`).
 */
export const THEMES = [
  { id: 'greet', title: 'Знакомство и вежливость' },
  { id: 'people', title: 'Люди и отношения' },
  { id: 'body', title: 'Тело и здоровье' },
  { id: 'feel', title: 'Чувства и характер' },
  { id: 'home', title: 'Дом и быт' },
  { id: 'food', title: 'Еда, кафе, ресторан' },
  { id: 'shop', title: 'Покупки и деньги' },
  { id: 'city', title: 'Город и транспорт' },
  { id: 'travel', title: 'Путешествия и отдых' },
  { id: 'work', title: 'Работа и карьера' },
  { id: 'biz', title: 'Бизнес, финансы, рынок' },
  { id: 'study', title: 'Учёба и язык' },
  { id: 'time', title: 'Время и календарь' },
  { id: 'weather', title: 'Погода и времена года' },
  { id: 'nature', title: 'Природа и животные' },
  { id: 'sport', title: 'Спорт и хобби' },
  { id: 'tech', title: 'Техника и интернет' },
  { id: 'talk', title: 'Разговор и мнения' },
  { id: 'clothes', title: 'Одежда и внешность' },
  { id: 'amount', title: 'Числа, количество, размер' },
  { id: 'move', title: 'Действия и движение' },
  { id: 'describe', title: 'Качества и описания' },
  { id: 'society', title: 'Общество, закон, политика' },
  { id: 'ideas', title: 'Мысли и понятия' },
  { id: 'func', title: 'Служебные слова' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

/** Часть речи — для подписи в словаре. */
export type Pos = 'n' | 'v' | 'adj' | 'adv' | 'prep' | 'pron' | 'conj' | 'det' | 'num' | 'int' | 'phr';

/** Слово общего словаря (NGSL и разговорное дополнение). Карточка — `v:<en>`. */
export interface VocabWord {
  en: string;
  ru: string;
  theme: ThemeId;
  pos: Pos;
  /** Место по частоте (NGSL 1.2); у дополнения — 3000 + порядковый номер. */
  rank: number;
  /** Свой пример: [английский, русский]. */
  example?: [string, string];
}
