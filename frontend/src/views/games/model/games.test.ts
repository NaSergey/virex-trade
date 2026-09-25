import { describe, expect, it } from 'vitest';
import en from '@/shared/i18n/messages/en.json';
import ru from '@/shared/i18n/messages/ru.json';
import { GAMES } from './games';

type Items = Record<string, { title?: string; description?: string }>;
type Games = { items?: Items; tags?: Record<string, string> };
const gamesOf = (messages: unknown) => (messages as { games?: Games }).games ?? {};

describe('GAMES — каталог игр', () => {
  it('id уникальны', () => {
    const ids = GAMES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('каждая игра живёт под /games/<id>', () => {
    for (const g of GAMES) expect(g.href).toBe(`/games/${g.id}`);
  });

  it.each([
    ['ru', ru],
    ['en', en],
  ])('у каждой игры есть название и описание (%s)', (_locale, messages) => {
    const texts = gamesOf(messages).items ?? {};
    for (const g of GAMES) {
      expect(texts[g.id]?.title, `${g.id}.title`).toBeTruthy();
      expect(texts[g.id]?.description, `${g.id}.description`).toBeTruthy();
    }
  });

  // Чип без перевода выпадет ошибкой next-intl прямо на витрине, а не молча.
  it.each([
    ['ru', ru],
    ['en', en],
  ])('у каждого чипа есть подпись (%s)', (_locale, messages) => {
    const tags = gamesOf(messages).tags ?? {};
    for (const g of GAMES) {
      for (const tag of g.tags) expect(tags[tag], `tags.${tag}`).toBeTruthy();
    }
  });

  it('написаны блэкджек, покер, джетпак и торговля', () => {
    expect(GAMES.filter((g) => g.available).map((g) => g.id)).toEqual(['blackjack', 'poker', 'jetpack', 'trading']);
  });

  // Без обоих карточка отрисует <Image> без src и уронит витрину.
  it('у каждой игры есть снимок или сцена', () => {
    for (const g of GAMES) expect(Boolean(g.image || g.scene), g.id).toBe(true);
  });

  it('у каждой игры есть хотя бы один чип', () => {
    for (const g of GAMES) expect(g.tags.length, g.id).toBeGreaterThan(0);
  });
});
