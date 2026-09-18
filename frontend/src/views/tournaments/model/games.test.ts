import { describe, expect, it } from 'vitest';
import en from '@/shared/i18n/messages/en.json';
import ru from '@/shared/i18n/messages/ru.json';
import { GAMES } from './games';

type Games = Record<string, { title?: string; description?: string }>;
const textsOf = (messages: unknown) => (messages as { tournaments?: { games?: Games } }).tournaments?.games ?? {};

describe('GAMES — каталог игр', () => {
  it('id уникальны', () => {
    const ids = GAMES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('каждая игра живёт под /tournaments/<id>', () => {
    for (const g of GAMES) expect(g.href).toBe(`/tournaments/${g.id}`);
  });

  it.each([
    ['ru', ru],
    ['en', en],
  ])('у каждой игры есть название и описание (%s)', (_locale, messages) => {
    const texts = textsOf(messages);
    for (const g of GAMES) {
      expect(texts[g.id]?.title, `${g.id}.title`).toBeTruthy();
      expect(texts[g.id]?.description, `${g.id}.description`).toBeTruthy();
    }
  });
});
