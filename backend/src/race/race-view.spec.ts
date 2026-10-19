import { RaceRuntime } from './race-runtime';
import { buildView, type RaceRecord } from './race-view';
import { COUNTDOWN } from './sim';

const rec = (patch: Partial<RaceRecord> = {}): RaceRecord => ({
  id: 'r1',
  stake: 50,
  seed: 4,
  createdAt: 1000,
  lobbyEndsAt: 16_000,
  entries: [
    {
      entryId: 'e1',
      slot: 0,
      userId: 'a',
      name: 'Аня',
      car: 'buggy',
      joinedAt: new Date(1000),
      bot: false,
    },
    {
      entryId: 'e2',
      slot: 1,
      userId: null,
      name: 'Сурок',
      car: 'tank',
      joinedAt: new Date(1000),
      bot: true,
    },
  ],
  runtime: null,
  result: null,
  finishing: false,
  closed: false,
  ...patch,
});

describe('buildView', () => {
  it('без гонки — фаза none и настройки', () => {
    const v = buildView(null, 'a', 5, []);
    expect(v).toMatchObject({ phase: 'none', serverNow: 5, race: null });
    expect(v.config.stakes).toEqual([10, 50, 100, 500]);
  });

  it('лобби: банк — ставка на троих, «я» помечен, бот подписан', () => {
    const v = buildView(rec(), 'a', 5, []);
    expect(v.phase).toBe('lobby');
    expect(v.race).toMatchObject({ pot: 150, me: 0, dyn: null, startAt: null });
    expect(v.race!.racers).toEqual([
      { slot: 0, name: 'Аня', bot: false, car: 'buggy', me: true },
      { slot: 1, name: 'Сурок', bot: true, car: 'tank', me: false },
    ]);
  });

  it('идущая гонка несёт состояние без трассы, фаза — по времени гонки', () => {
    const runtime = new RaceRuntime(
      0,
      4,
      [
        { slot: 0, car: 'buggy', bot: false },
        { slot: 1, car: 'tank', bot: true },
        { slot: 2, car: 'arrow', bot: true },
      ],
      1,
    );
    const r = rec({ runtime });
    expect(buildView(r, 'a', 5, []).phase).toBe('countdown');
    runtime.advance((COUNTDOWN + 1) * 1000);
    const v = buildView(r, 'b', 5, [{ k: 'slide', t: 1, slot: 0 }]);
    expect(v.phase).toBe('racing');
    expect(v.race!.me).toBeNull();
    expect(v.race!.dyn).not.toHaveProperty('course');
    expect(v.race!.events).toHaveLength(1);
  });
});
