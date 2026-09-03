import { defaultPrefs, togglePref } from '../notifications/prefs';
import { NOTIF_DEFS } from '../notifications/registry';
import { categoryPanel, parsePanelCallback, rootPanel } from './settings-panel';

type Button = { text: string; callback_data: string };
const buttons = (markup: { inline_keyboard: Button[][] }): Button[] =>
  markup.inline_keyboard.flat();

describe('rootPanel', () => {
  it('показывает три категории и переключатель тихих часов', () => {
    const panel = rootPanel(defaultPrefs());
    const texts = buttons(panel.reply_markup).map((b) => b.text);
    expect(texts.some((t) => t.includes('Рынок'))).toBe(true);
    expect(texts.some((t) => t.includes('Сделки'))).toBe(true);
    expect(texts.some((t) => t.includes('Отчёты'))).toBe(true);
    expect(texts.some((t) => t.includes('Тихие часы'))).toBe(true);
  });

  it('считает включённые в категории', () => {
    // По умолчанию из семи рыночных включён один — mkt.price1h.
    const panel = rootPanel(defaultPrefs());
    expect(buttons(panel.reply_markup).some((b) => b.text.includes('1 из 7'))).toBe(true);
  });

  it('счётчик реагирует на переключение', () => {
    const panel = rootPanel(togglePref(defaultPrefs(), 'mkt.vol1h'));
    expect(buttons(panel.reply_markup).some((b) => b.text.includes('2 из 7'))).toBe(true);
  });
});

describe('categoryPanel', () => {
  it('рисует по кнопке на сигнал плюс кнопки порогов', () => {
    const panel = categoryPanel(defaultPrefs(), 'market');
    const data = buttons(panel.reply_markup).map((b) => b.callback_data);
    expect(data).toContain('nt|mkt.vol1h');
    expect(data).toContain('nv|mkt.price1h');
    expect(data).toContain('nb');
  });

  it('у сигнала без порога кнопки порога нет', () => {
    const panel = categoryPanel(defaultPrefs(), 'trade');
    const data = buttons(panel.reply_markup).map((b) => b.callback_data);
    expect(data).toContain('nt|trade.opened');
    expect(data).not.toContain('nv|trade.opened');
  });

  // Порог выключенного сигнала ничего не значит и только удлиняет список.
  it('у выключенного сигнала порог не показывается', () => {
    const panel = categoryPanel(defaultPrefs(), 'market');
    const data = buttons(panel.reply_markup).map((b) => b.callback_data);
    expect(data).not.toContain('nv|mkt.vol1h');
    const enabled = categoryPanel(togglePref(defaultPrefs(), 'mkt.vol1h'), 'market');
    expect(buttons(enabled.reply_markup).map((b) => b.callback_data)).toContain('nv|mkt.vol1h');
  });

  it('включённый сигнал помечен галочкой, выключенный — нет', () => {
    const panel = categoryPanel(defaultPrefs(), 'market');
    const btns = buttons(panel.reply_markup);
    expect(btns.find((b) => b.callback_data === 'nt|mkt.price1h')?.text).toContain('✅');
    expect(btns.find((b) => b.callback_data === 'nt|mkt.vol1h')?.text).toContain('⬜');
  });

  it('кнопка порога подписана текущим пресетом', () => {
    const panel = categoryPanel(defaultPrefs(), 'market');
    const btn = buttons(panel.reply_markup).find((b) => b.callback_data === 'nv|mkt.price1h');
    expect(btn?.text).toContain('≥ 3.5%');
  });
});

// Ограничение Telegram, из-за которого buildTagKeyboard уже вынужден
// фильтровать кнопки: превышение не ошибка, кнопка просто не работает.
describe('длина callback_data', () => {
  it('все кнопки панели укладываются в 64 байта', () => {
    const panels = [
      rootPanel(defaultPrefs()),
      ...(['market', 'trade', 'report'] as const).map((c) => categoryPanel(defaultPrefs(), c)),
    ];
    for (const p of panels) {
      for (const b of buttons(p.reply_markup)) {
        expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
      }
    }
  });

  it('ключи реестра сами по себе не длиннее допустимого', () => {
    for (const def of NOTIF_DEFS) {
      expect(Buffer.byteLength(`nt|${def.key}`)).toBeLessThanOrEqual(64);
    }
  });
});

describe('parsePanelCallback', () => {
  it('разбирает открытие категории', () => {
    expect(parsePanelCallback('ns|market')).toEqual({ kind: 'category', category: 'market' });
  });

  it('разбирает тумблер и порог', () => {
    expect(parsePanelCallback('nt|mkt.vol1h')).toEqual({ kind: 'toggle', key: 'mkt.vol1h' });
    expect(parsePanelCallback('nv|mkt.vol1h')).toEqual({ kind: 'preset', key: 'mkt.vol1h' });
  });

  it('разбирает тихие часы и возврат', () => {
    expect(parsePanelCallback('nq')).toEqual({ kind: 'quiet' });
    expect(parsePanelCallback('nb')).toEqual({ kind: 'root' });
  });

  it('чужое и мусорное не разбирает', () => {
    expect(parsePanelCallback('pt|BTCUSDT|long|x')).toBeNull();
    expect(parsePanelCallback('ns|нетакой')).toBeNull();
    expect(parsePanelCallback('nt|mkt.gone')).toBeNull();
    expect(parsePanelCallback('')).toBeNull();
  });
});
