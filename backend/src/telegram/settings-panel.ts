import { Prefs, isEnabled, presetLabelOf } from '../notifications/prefs';
import {
  CATEGORIES,
  CATEGORY_META,
  NotifCategory,
  defsByCategory,
  notifDef,
} from '../notifications/registry';

/**
 * Панель `/settings`. Два уровня — категории и сигналы внутри категории:
 * двенадцать тумблеров вместе со строками порогов в одном сообщении
 * превращаются в простыню, в которой не найти нужное.
 *
 * Префиксы callback_data короткие (`ns`, `nt`, `nv`, `nq`, `nb`) по той же
 * причине, по которой они короткие у кнопок тегов: 64 байта — это весь бюджет.
 */

interface Button {
  text: string;
  callback_data: string;
}

export interface Panel {
  text: string;
  reply_markup: { inline_keyboard: Button[][] };
}

export type PanelAction =
  | { kind: 'root' }
  | { kind: 'category'; category: NotifCategory }
  | { kind: 'toggle'; key: string }
  | { kind: 'preset'; key: string }
  | { kind: 'quiet' };

const mark = (on: boolean) => (on ? '✅' : '⬜');

export const rootPanel = (prefs: Prefs): Panel => {
  const rows: Button[][] = CATEGORIES.map((category) => {
    const defs = defsByCategory(category);
    const on = defs.filter((d) => isEnabled(prefs, d.key)).length;
    const meta = CATEGORY_META[category];
    return [
      {
        text: `${meta.emoji} ${meta.title} · ${on} из ${defs.length}`,
        callback_data: `ns|${category}`,
      },
    ];
  });
  rows.push([
    {
      text: `${mark(prefs.quietHours)} Тихие часы 23:00–08:00`,
      callback_data: 'nq',
    },
  ]);
  return {
    text: '<b>Уведомления</b>\nВыбери раздел, чтобы включить или выключить сигналы.',
    reply_markup: { inline_keyboard: rows },
  };
};

export const categoryPanel = (prefs: Prefs, category: NotifCategory): Panel => {
  const meta = CATEGORY_META[category];
  const rows: Button[][] = [];
  for (const def of defsByCategory(category)) {
    const on = isEnabled(prefs, def.key);
    rows.push([{ text: `${mark(on)} ${def.emoji} ${def.title}`, callback_data: `nt|${def.key}` }]);
    const label = presetLabelOf(prefs, def.key);
    // Порог показывается только у включённого сигнала: у выключенного он
    // ничего не значит и только удлиняет список.
    if (label && on) {
      rows.push([{ text: `порог: ${label} ▸`, callback_data: `nv|${def.key}` }]);
    }
  }
  rows.push([{ text: '◀ Назад', callback_data: 'nb' }]);
  return {
    text: `<b>${meta.emoji} ${meta.title}</b>`,
    reply_markup: { inline_keyboard: rows },
  };
};

const isCategory = (v: string): v is NotifCategory => (CATEGORIES as string[]).includes(v);

export const parsePanelCallback = (data: string): PanelAction | null => {
  const [kind, arg] = String(data ?? '').split('|');
  if (kind === 'nb') return { kind: 'root' };
  if (kind === 'nq') return { kind: 'quiet' };
  if (kind === 'ns') return arg && isCategory(arg) ? { kind: 'category', category: arg } : null;
  if (kind === 'nt') return arg && notifDef(arg) ? { kind: 'toggle', key: arg } : null;
  if (kind === 'nv') return arg && notifDef(arg) ? { kind: 'preset', key: arg } : null;
  return null;
};
