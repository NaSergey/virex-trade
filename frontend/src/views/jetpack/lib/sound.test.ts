import { describe, expect, it } from 'vitest';
import type { JetpackMyBet, JetpackPhase } from '@/entities/jetpack';
import { arpAt, bassAt, CHORD_STEPS, chordAt, driveOf, engineTone, hz, soundEvents } from './sound';

const bet = (cashoutX100: number | null = null): JetpackMyBet => ({ amount: 10, autoX100: null, cashoutX100, payout: null });
const snap = (phase: JetpackPhase, roundId = 'r1', me: JetpackMyBet | null = null) => ({ phase, roundId, me });

describe('soundEvents', () => {
  it('первый снимок страницы беззвучен — даже посреди полёта', () => {
    expect(soundEvents(null, snap('flying', 'r1', bet()))).toEqual([]);
  });

  it('тот же снимок — тишина', () => {
    const s = snap('flying', 'r1', bet());
    expect(soundEvents(s, s)).toEqual([]);
  });

  it('взлёт и краш — по смене фазы на глазах', () => {
    expect(soundEvents(snap('betting'), snap('flying'))).toEqual(['launch']);
    expect(soundEvents(snap('flying'), snap('crashed'))).toEqual(['crash']);
    expect(soundEvents(snap('crashed'), snap('betting', 'r2'))).toEqual([]);
  });

  it('своя ставка — один раз за раунд', () => {
    expect(soundEvents(snap('betting'), snap('betting', 'r1', bet()))).toEqual(['bet']);
    expect(soundEvents(snap('betting', 'r1', bet()), snap('flying', 'r1', bet()))).toEqual(['launch']);
  });

  it('свой вывод — когда появился множитель вывода', () => {
    expect(soundEvents(snap('flying', 'r1', bet()), snap('flying', 'r1', bet(250)))).toEqual(['cashout']);
    expect(soundEvents(snap('flying', 'r1', bet(250)), snap('crashed', 'r1', bet(250)))).toEqual(['crash']);
  });
});

describe('engineTone', () => {
  it('громкость — за тягой, без тяги двигатель молчит', () => {
    expect(engineTone(0, 1).level).toBe(0);
    expect(engineTone(1, 1).level).toBeGreaterThan(engineTone(0.18, 1).level);
  });

  it('свист растёт с множителем и не уходит в писк', () => {
    expect(engineTone(1, 4).whine).toBeGreaterThan(engineTone(1, 2).whine);
    expect(engineTone(1, 1e6).whine).toBeLessThanOrEqual(1400);
    expect(engineTone(1, 1e6).cutoff).toBeLessThanOrEqual(2400);
  });
});

describe('музыка', () => {
  it('ля первой октавы — 440 Гц', () => {
    expect(hz(69)).toBe(440);
    expect(hz(81)).toBeCloseTo(880);
  });

  it('аккорд держится два такта и цикл замыкается через четыре', () => {
    expect(chordAt(0)).toBe(chordAt(CHORD_STEPS - 1));
    expect(chordAt(CHORD_STEPS)).not.toBe(chordAt(0));
    expect(chordAt(4 * CHORD_STEPS)).toBe(chordAt(0));
  });

  it('арпеджио — из тонов текущего аккорда', () => {
    for (let step = 0; step < 4 * CHORD_STEPS; step++) {
      const classes = chordAt(step).pad.map((n) => n % 12);
      expect(classes).toContain(arpAt(step) % 12);
    }
  });

  it('бас — восьмыми: корень на долю, октава между долями', () => {
    const root = chordAt(0).bass;
    expect([0, 1, 2, 3, 4].map(bassAt)).toEqual([root, null, root + 12, null, root]);
  });

  it('разгон — от нуля на старте до единицы к 16x', () => {
    expect(driveOf(1)).toBe(0);
    expect(driveOf(16)).toBe(1);
    expect(driveOf(1000)).toBe(1);
  });
});
