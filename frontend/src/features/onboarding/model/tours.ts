/**
 * Что и в каком порядке рассказывается в каждом разделе.
 *
 * Тур знает про страницу ровно одну строку — селектор якоря. Ни один компонент
 * раздела не получает пропсов ради обучения и не меняет своей логики: подсветка
 * цепляется за атрибут `data-tour`, проставленный на уже существующем узле.
 * Поэтому обучение снимается целиком удалением этой фичи и грепом по атрибуту,
 * а не разбором того, что в страницах наросло.
 *
 * Шаг без якоря — карточка по центру экрана и затемнение без дырки. Такими
 * идут вводные фразы: «что это за продукт», «зачем этот раздел» — им нечего
 * подсвечивать, они говорят о странице целиком.
 *
 * Шаг, чьего якоря в документе нет, ПРОПУСКАЕТСЯ (см. useAnchorRect). Это не
 * обработка ошибки, а рабочий механизм: кривой эквити нет, пока нет двух точек,
 * открытых позиций нет, пока их нет, переключателя бирж нет, когда биржа одна.
 * Заводить на каждый такой случай своё условие означало бы держать в туре
 * второе, всегда отстающее знание о том, что сейчас на экране.
 */

export type TourId = 'overview' | 'tags' | 'analytics' | 'market' | 'settings';

export interface TourStep {
  /**
   * CSS-селектор подсвечиваемого узла. Без него карточка встаёт по центру.
   */
  anchor?: string;
  /**
   * Ключ внутри `onboarding.<tourId>` — из него берутся `<key>Title` и
   * `<key>Body`. Ключ, а не текст: тексты живут в каталогах ru/en, и их
   * паритет проверяется тестом.
   */
  key: string;
  /**
   * Обложка: широкое окно с представлением продукта вместо узкой подсказки.
   *
   * Кроме `<key>Title` и `<key>Body` читает ТРИ пункта — `<key>P1Title` /
   * `<key>P1Body` и так до третьего. Число пунктов зафиксировано намеренно:
   * это путь к своей системе (найти — проверить — сделать стабильной), а не
   * список фич, который дописывают по мере их появления.
   *
   * Ставится только на шаг БЕЗ якоря: обложка говорит о продукте целиком,
   * подсвечивать ей нечего.
   */
  cover?: boolean;
}

export interface Tour {
  id: TourId;
  /** Адрес раздела: на нём тур запускается сам при первом заходе. */
  path: string;
  steps: TourStep[];
}

export const TOURS: Tour[] = [
  {
    id: 'overview',
    path: '/overview',
    steps: [
      // Первое, что человек вообще видит в продукте. Не «вот интерфейс», а
      // «вот ради чего всё это»: найти свою систему и сделать её стабильной.
      // Без этой рамки разметка тегами дальше выглядит бессмысленной работой.
      // Обложкой, а не узкой подсказкой: подсказка объясняет элемент, а здесь
      // объяснять надо, ради чего вообще открыт весь остальной тур.
      { key: 'welcome', cover: true },
      { anchor: '[data-tour="nav"]', key: 'nav' },
      { anchor: '[data-tour="period"]', key: 'period' },
      { anchor: '[data-tour="summary"]', key: 'summary' },
      { anchor: '[data-tour="equity"]', key: 'equity' },
      { anchor: '[data-tour="positions"]', key: 'positions' },
      { anchor: '[data-tour="trades"]', key: 'trades' },
      { key: 'next' },
    ],
  },
  {
    id: 'tags',
    path: '/tags',
    steps: [
      { key: 'intro' },
      { anchor: '[data-tour="tags-combos"]', key: 'combos' },
      // Здесь же — оговорка про пересечение строк. Это единственное место
      // продукта, где число можно прочитать неверно и не заметить этого:
      // сделка засчитывается каждому своему тегу целиком, и колонка не
      // складывается в общий PnL.
      { anchor: '[data-tour="tags-all"]', key: 'all' },
    ],
  },
  {
    id: 'analytics',
    path: '/analytics',
    steps: [
      { key: 'intro' },
      { anchor: '[data-tour="lab-filters"]', key: 'filters' },
      { anchor: '[data-tour="lab-compare"]', key: 'compare' },
      { anchor: '[data-tour="lab-equity"]', key: 'equity' },
    ],
  },
  {
    id: 'market',
    path: '/market',
    steps: [
      { key: 'intro' },
      { anchor: '[data-tour="market-macro"]', key: 'macro' },
      { anchor: '[data-tour="market-positioning"]', key: 'positioning' },
      { anchor: '[data-tour="market-weekday"]', key: 'weekday' },
    ],
  },
  {
    id: 'settings',
    path: '/settings',
    steps: [
      { anchor: '[data-tour="set-form"]', key: 'keys' },
      { anchor: '[data-tour="set-exchange"]', key: 'exchange' },
      { anchor: '[data-tour="set-telegram"]', key: 'telegram' },
    ],
  },
];

/**
 * Тур этого адреса, если он есть.
 *
 * Сравнение по началу пути, а не строгим равенством: у раздела могут появиться
 * вложенные адреса, и тур обязан считаться пройденным для всей ветки — ровно
 * та же граница по слэшу, что у подсветки пункта в рейке.
 */
export function tourForPath(pathname: string): Tour | undefined {
  return TOURS.find((t) => pathname === t.path || pathname.startsWith(`${t.path}/`));
}
