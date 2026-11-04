import { describe, expect, it } from 'vitest';
import { absorb, critWindow, damageOf, enemyTurn, type DamageInput, type Foe } from './combat';

const hit = (p: Partial<DamageInput>) =>
  damageOf({
    mode: 'recall',
    combo: 0,
    crit: false,
    sharpen: 0,
    relics: [],
    weather: 'clear',
    character: 'tourist',
    boss: false,
    typo: false,
    revenge: false,
    paper: false,
    ...p,
  });

const foe = (p: Partial<Foe> = {}): Foe => ({
  id: 'echo',
  name: 'Эхо',
  hp: 20,
  maxHp: 20,
  atk: 4,
  every: 4,
  timer: 4,
  kind: 'fight',
  ...p,
});

describe('урон', () => {
  it('база, серия и крит', () => {
    expect(hit({})).toBe(5);
    expect(hit({ combo: 4 })).toBe(7);
    expect(hit({ combo: 30 })).toBe(10);
    expect(hit({ crit: true })).toBe(8);
    expect(hit({ mode: 'recognize' })).toBe(2);
  });

  it('слабость ×1,5, стойкость ×0,5, не меньше 1', () => {
    expect(hit({ weak: 'recall' })).toBe(8);
    expect(hit({ resist: 'recall' })).toBe(3);
    expect(hit({ mode: 'recognize', resist: 'recognize' })).toBe(1);
  });

  it('погода, находки, персонажи', () => {
    expect(hit({ crit: true, weather: 'fog' })).toBe(10);
    expect(hit({ mode: 'listen', crit: true, weather: 'fog' })).toBe(5);
    expect(hit({ combo: 2, relics: ['metronome'] })).toBe(7);
    expect(hit({ combo: 2, weather: 'wind' })).toBe(7);
    expect(hit({ mode: 'speak', relics: ['megaphone'] })).toBe(9);
    expect(hit({ mode: 'recognize', character: 'announcer' })).toBe(1);
    expect(hit({ typo: true })).toBe(3);
    expect(hit({ sharpen: 1 })).toBe(6);
    expect(hit({ revenge: true, relics: ['notebook'] })).toBe(10);
    expect(hit({ revenge: true })).toBe(5);
    expect(hit({ paper: true })).toBe(10);
  });

  it('хранитель: урон по виду упражнения, Студент ×1,5', () => {
    expect(hit({ boss: true, exercise: 'translate' })).toBe(9);
    expect(hit({ boss: true, exercise: 'choice', character: 'student' })).toBe(8);
  });

  it('окно крита: секундомер длиннее, туман 3 короче', () => {
    expect(critWindow('recall', [], 0)).toBe(6000);
    expect(critWindow('recall', ['stopwatch'], 0)).toBe(8000);
    expect(critWindow('recognize', [], 3)).toBe(1500);
  });
});

describe('ход противника', () => {
  it('верные ответы приближают удар, на нуле — удар и сброс', () => {
    let f = foe();
    const hits: number[] = [];
    for (let i = 0; i < 4; i++) {
      const t = enemyTurn(f, 'right');
      f = t.foe;
      hits.push(t.hit);
    }
    expect(hits).toEqual([0, 0, 0, 4]);
    expect(f.timer).toBe(4);
  });

  it('ошибка — удар сразу и сброс счётчика', () => {
    const t = enemyTurn(foe({ timer: 2 }), 'wrong');
    expect(t.hit).toBe(4);
    expect(t.foe.timer).toBe(4);
  });

  it('щит раньше здоровья; Зонт гасит первый удар боя; Шарф ослабляет на 1', () => {
    expect(absorb({ hp: 20, shield: 3 }, 5, { umbrella: false, brolly: false, scarf: false })).toMatchObject({
      hp: 18,
      shield: 0,
      taken: 2,
    });
    const first = absorb({ hp: 20, shield: 0 }, 5, { umbrella: true, brolly: false, scarf: false });
    expect(first).toMatchObject({ hp: 20, blockedBy: 'umbrella' });
    expect(absorb({ hp: 20, shield: 0 }, 5, { umbrella: false, brolly: false, scarf: true }).hp).toBe(16);
    expect(absorb({ hp: 20, shield: 0 }, 5, { umbrella: false, brolly: true, scarf: false })).toMatchObject({
      hp: 20,
      blockedBy: 'brolly',
    });
  });
});
