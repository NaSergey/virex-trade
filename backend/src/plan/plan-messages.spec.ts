import {
  CB,
  eveningMessage,
  itemMessage,
  morningMessage,
  type MsgItem,
} from './plan-messages';
import { summarize } from './plan-stats';

const it0: MsgItem = {
  id: 'ckabc',
  day: '2026-10-23',
  startMin: 600,
  endMin: 720,
  title: 'Бектест <BTC>',
  category: 'backtest',
  track: true,
  status: 'planned',
  tasks: [{ text: 'Разобрать 20 сделок', done: false }],
};

const actions = (kb: { inline_keyboard: { callback_data: string }[][] }) =>
  kb.inline_keyboard.flat().map((b) => b.callback_data.split('|')[1]);

describe('plan-messages', () => {
  it('напоминание: три ответа, текст экранирован, данные кнопки влезают в 64 байта', () => {
    const m = itemMessage(it0, '2026-10-23', 600);
    expect(m.text).toContain('10:00–12:00');
    expect(m.text).toContain('Бектест &lt;BTC&gt;');
    expect(m.text).toContain('Разобрать 20 сделок');
    expect(actions(m.kb)).toEqual(['go', 'walk', 'skip']);
    const longId = { ...it0, id: 'c'.repeat(30) };
    for (const b of itemMessage(
      longId,
      '2026-10-23',
      600,
    ).kb.inline_keyboard.flat()) {
      expect(b.callback_data.startsWith(`${CB}|`)).toBe(true);
      expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
    }
  });

  it('после «сажусь» — итог; после конца блока — вопрос «как прошло»', () => {
    const started = {
      ...it0,
      status: 'started',
      startedAt: '10:07',
      lateMin: 7,
    };
    const during = itemMessage(started, '2026-10-23', 650);
    expect(during.text).toContain('Сел в 10:07 · опоздание 7 мин');
    expect(actions(during.kb)).toEqual(['done', 'part']);
    expect(actions(itemMessage(started, '2026-10-23', 720).kb)).toEqual([
      'done',
      'part',
      'skip',
    ]);
  });

  it('без ответа к концу — можно ответить задним числом; «забил» до конца — можно передумать', () => {
    expect(actions(itemMessage(it0, '2026-10-23', 730).kb)).toEqual([
      'done',
      'part',
      'walk',
      'skip',
    ]);
    expect(
      actions(itemMessage({ ...it0, status: 'skipped' }, '2026-10-23', 650).kb),
    ).toEqual(['go']);
    expect(
      itemMessage({ ...it0, status: 'skipped' }, '2026-10-23', 730).kb
        .inline_keyboard,
    ).toEqual([]);
    expect(
      itemMessage({ ...it0, status: 'done' }, '2026-10-23', 650).kb
        .inline_keyboard,
    ).toEqual([]);
  });

  it('утренний план и вечерний отчёт', () => {
    expect(morningMessage('2026-10-23', [it0], 400)).toContain(
      'План на пт 23 окт',
    );
    const done = { ...it0, status: 'done' };
    const text = eveningMessage(
      '2026-10-23',
      [done],
      summarize([done], '2026-10-23', 1300),
      1300,
      3,
    );
    expect(text).toContain('соблюдение 100%');
    expect(text).toContain('сделано 1');
    expect(text).toContain('Серия дней по плану (от 70%): 3');
  });
});
