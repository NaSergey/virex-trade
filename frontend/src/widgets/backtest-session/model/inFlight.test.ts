import { describe, expect, it } from 'vitest';
import { createInFlight } from './inFlight';

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('createInFlight — пометки «исполнение отправлено» у прокрутки', () => {
  it('пока запрос в пути, уровень помечен', () => {
    const marks = createInFlight();
    marks.track('o1', new Promise(() => {}));
    expect(marks.has('o1')).toBe(true);
    expect(marks.has('o2')).toBe(false);
  });

  it('успех — пометка остаётся: ордер уже снят сервером, второй запрос не нужен', async () => {
    const marks = createInFlight();
    marks.track('o1', Promise.resolve());
    await settle();
    expect(marks.has('o1')).toBe(true);
  });

  it('отказ — пометка снимается, и уровень проверяется снова', async () => {
    const marks = createInFlight();
    marks.track('o1', Promise.reject(new Error('500')));
    await settle();
    expect(marks.has('o1')).toBe(false);
  });

  it('после предела отказов пометка остаётся — постоянная ошибка не шлёт запрос на каждом тике', async () => {
    const marks = createInFlight(3);
    for (let i = 0; i < 3; i++) {
      marks.track('o1', Promise.reject(new Error('409')));
      await settle();
    }
    expect(marks.has('o1')).toBe(true);
  });

  it('без предела (закрытия) отказ снимает пометку всегда — стоп обязан проверяться дальше', async () => {
    const marks = createInFlight();
    for (let i = 0; i < 10; i++) {
      marks.track('t1', Promise.reject(new Error('500')));
      await settle();
    }
    expect(marks.has('t1')).toBe(false);
  });
});
