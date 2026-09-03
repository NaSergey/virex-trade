/**
 * Реестр типов уведомлений — единственное место, где живёт знание о том,
 * какие сигналы бывают, как они называются и какие у них пороги. Панель бота,
 * чекеры и карточка в настройках читают отсюда: добавить сигнал должно
 * означать добавить запись, а не править четыре файла.
 */

export type NotifKey =
  | 'mkt.price1h'
  | 'mkt.vol1h'
  | 'mkt.volume'
  | 'mkt.fng'
  | 'mkt.ls'
  | 'mkt.book'
  | 'mkt.hour'
  | 'trade.opened'
  | 'trade.closed'
  | 'trade.overtrade'
  | 'report.weekly'
  | 'sys.sync';

export type NotifCategory = 'market' | 'trade' | 'report';

export interface NotifPreset {
  /** Число, с которым сравнивает чекер. Смысл зависит от сигнала. */
  value: number;
  /** Подпись на кнопке: «≥ 2%», «×2», «25/75». */
  label: string;
}

export interface NotifDef {
  key: NotifKey;
  category: NotifCategory;
  emoji: string;
  title: string;
  /** Пустой массив — у сигнала нет порога. */
  presets: NotifPreset[];
  /** Индекс в presets. 0 у сигналов без порога. */
  defaultPreset: number;
  defaultEnabled: boolean;
  /** Минимальный промежуток между двумя отправками этого сигнала. */
  cooldownMs: number;
  /** Событие, которое человек сам и вызвал, — тихие часы его не глушат. */
  ignoresQuietHours: boolean;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const CATEGORY_META: Record<NotifCategory, { emoji: string; title: string }> = {
  market: { emoji: '📈', title: 'Рынок' },
  trade: { emoji: '📊', title: 'Сделки' },
  report: { emoji: '🗓', title: 'Отчёты и сервис' },
};

export const NOTIF_DEFS: NotifDef[] = [
  {
    key: 'mkt.price1h',
    category: 'market',
    emoji: '📈',
    title: 'Движение цены 1ч',
    // value — модуль изменения свечи в процентах.
    presets: [
      { value: 1, label: '≥ 1%' },
      { value: 2, label: '≥ 2%' },
      { value: 3.5, label: '≥ 3.5%' },
    ],
    defaultPreset: 2,
    defaultEnabled: true,
    cooldownMs: 2 * HOUR,
    ignoresQuietHours: false,
  },
  {
    key: 'mkt.vol1h',
    category: 'market',
    emoji: '⚡',
    title: 'Волатильность 1ч',
    // value — во сколько раз размах часа превышает средний часовой за неделю.
    presets: [
      { value: 1.5, label: '×1.5' },
      { value: 2, label: '×2' },
      { value: 3, label: '×3' },
    ],
    defaultPreset: 1,
    defaultEnabled: false,
    cooldownMs: 2 * HOUR,
    ignoresQuietHours: false,
  },
  {
    key: 'mkt.volume',
    category: 'market',
    emoji: '📊',
    title: 'Объём',
    // value — насколько объём за сутки выше среднего за неделю, в процентах.
    presets: [
      { value: 25, label: '+25%' },
      { value: 50, label: '+50%' },
      { value: 100, label: '+100%' },
    ],
    defaultPreset: 1,
    defaultEnabled: false,
    cooldownMs: 2 * HOUR,
    ignoresQuietHours: false,
  },
  {
    key: 'mkt.fng',
    category: 'market',
    emoji: '😱',
    title: 'Fear & Greed',
    // value — нижняя граница; верхняя симметрична: 100 − value.
    presets: [
      { value: 40, label: '40/60' },
      { value: 25, label: '25/75' },
    ],
    defaultPreset: 1,
    defaultEnabled: false,
    // Индекс пересчитывается раз в сутки — чаще напоминать не о чем.
    cooldownMs: 12 * HOUR,
    ignoresQuietHours: false,
  },
  {
    key: 'mkt.ls',
    category: 'market',
    emoji: '⚖️',
    title: 'Перекос long/short',
    // value — доля лонгов в процентах; шорт-сторона симметрична.
    presets: [
      { value: 65, label: '65/35' },
      { value: 70, label: '70/30' },
      { value: 75, label: '75/25' },
    ],
    defaultPreset: 1,
    defaultEnabled: false,
    cooldownMs: 6 * HOUR,
    ignoresQuietHours: false,
  },
  {
    key: 'mkt.book',
    category: 'market',
    emoji: '📖',
    title: 'Раздвижка стакана',
    // value — во сколько раз раздвижка шире средней за неделю.
    presets: [
      { value: 1.5, label: '×1.5' },
      { value: 2, label: '×2' },
      { value: 3, label: '×3' },
    ],
    defaultPreset: 1,
    defaultEnabled: false,
    cooldownMs: 6 * HOUR,
    ignoresQuietHours: false,
  },
  {
    key: 'mkt.hour',
    category: 'market',
    emoji: '⏰',
    title: 'Волатильный час',
    // value: 0 — только час, 1 — час и слабый для лонга день недели.
    presets: [
      { value: 0, label: 'только час' },
      { value: 1, label: 'час + слабый день' },
    ],
    defaultPreset: 0,
    defaultEnabled: false,
    // Меньше часа: сигнал предупреждает о начале следующего часа, и два
    // волатильных часа подряд — это два разных повода.
    cooldownMs: 50 * 60_000,
    ignoresQuietHours: false,
  },
  {
    key: 'trade.opened',
    category: 'trade',
    emoji: '🆕',
    title: 'Открыта позиция',
    presets: [],
    defaultPreset: 0,
    defaultEnabled: true,
    cooldownMs: 0,
    ignoresQuietHours: true,
  },
  {
    key: 'trade.closed',
    category: 'trade',
    emoji: '🏁',
    title: 'Закрыта позиция',
    presets: [],
    defaultPreset: 0,
    defaultEnabled: true,
    cooldownMs: 0,
    ignoresQuietHours: true,
  },
  {
    key: 'trade.overtrade',
    category: 'trade',
    emoji: '🔥',
    title: 'Переторговка',
    // value — число закрытых сделок за сутки.
    presets: [
      { value: 5, label: '> 5 за сутки' },
      { value: 10, label: '> 10 за сутки' },
      { value: 20, label: '> 20 за сутки' },
    ],
    defaultPreset: 1,
    defaultEnabled: false,
    cooldownMs: DAY,
    ignoresQuietHours: false,
  },
  {
    key: 'report.weekly',
    category: 'report',
    emoji: '🗓',
    title: 'Отчёт за неделю',
    presets: [],
    defaultPreset: 0,
    defaultEnabled: true,
    cooldownMs: 0,
    ignoresQuietHours: true,
  },
  {
    key: 'sys.sync',
    category: 'report',
    emoji: '🛠',
    title: 'Сбой синхронизации',
    presets: [],
    defaultPreset: 0,
    defaultEnabled: true,
    cooldownMs: DAY,
    ignoresQuietHours: true,
  },
];

const BY_KEY = new Map<string, NotifDef>(NOTIF_DEFS.map((d) => [d.key, d]));

export const notifDef = (key: string): NotifDef | undefined => BY_KEY.get(key);

export const defsByCategory = (category: NotifCategory): NotifDef[] =>
  NOTIF_DEFS.filter((d) => d.category === category);

export const CATEGORIES: NotifCategory[] = ['market', 'trade', 'report'];
