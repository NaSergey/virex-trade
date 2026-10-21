'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';
import { localDay, type DayRow } from '../model/activity';
import type { AnswerRow } from '../model/course';
import { myCardId, type CustomWord, type UserTheme } from '../model/deck';
import type { CardState } from '../model/srs';

/**
 * Прогресс владельца в учебнике (`backend/src/english`). Состояние грузится
 * одним запросом; каждая мутация правит кэш сразу, не дожидаясь ответа, ошибка —
 * перечитка. Возвращаясь на вкладку, состояние перечитывается: прогресс общий
 * у телефона и компьютера, и карточка, оценённая по устаревшему состоянию,
 * затёрла бы ответ с другого устройства.
 */

const BASE = '/api/admin/english';
const KEY = ['english', 'state'] as const;

interface CardRow {
  cardId: string;
  due: string;
  interval: number;
  ease: number;
  reps: number;
  lapses: number;
  firstAt: string;
  known: boolean;
}

interface StateResponse {
  cards: CardRow[];
  words: CustomWord[];
  lessons: { id: string; doneAt: string }[];
  answers: AnswerRow[];
  days: DayRow[];
  themes: UserTheme[];
}

/** Состояние в форме, удобной страницам: всё по id. */
export interface EnglishState {
  cards: ReadonlyMap<string, CardState>;
  words: CustomWord[];
  lessons: ReadonlySet<string>;
  /** Когда раздел отмечен пройденным, мс. */
  lessonDates: ReadonlyMap<string, number>;
  answers: ReadonlyMap<string, AnswerRow>;
  days: ReadonlyMap<string, DayRow>;
  themes: UserTheme[];
}

const toState = (r: StateResponse): EnglishState => ({
  cards: new Map(
    r.cards.map((c) => [
      c.cardId,
      {
        due: Date.parse(c.due),
        interval: c.interval,
        ease: c.ease,
        reps: c.reps,
        lapses: c.lapses,
        firstAt: Date.parse(c.firstAt),
        known: c.known,
      },
    ]),
  ),
  words: r.words,
  lessons: new Set(r.lessons.map((l) => l.id)),
  lessonDates: new Map(r.lessons.map((l) => [l.id, Date.parse(l.doneAt)])),
  answers: new Map(r.answers.map((a) => [a.itemId, a])),
  days: new Map(r.days.map((d) => [d.day, d])),
  themes: r.themes,
});

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export function useEnglishState() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => toState(await apiJson<StateResponse>(`${BASE}/state`)),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Мутация, которая правит кэш до ответа сервера. Перечитка в полёте
 * отменяется: пришедшая после правки, она вернула бы состояние до неё.
 */
function useStateMutation<V>(request: (v: V) => Promise<unknown>, apply: (s: EnglishState, v: V) => EnglishState) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: request,
    onMutate: async (v: V) => {
      await qc.cancelQueries({ queryKey: KEY });
      qc.setQueryData<EnglishState>(KEY, (s) => (s ? apply(s, v) : s));
    },
    onError: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Счётчик дня в кэше — тот же, что сервер нарастит по `day` запроса. */
function bumpDay(s: EnglishState, add: Partial<Omit<DayRow, 'day'>>): EnglishState {
  const day = localDay(Date.now());
  const prev = s.days.get(day) ?? { day, cards: 0, answers: 0, correct: 0, phrases: 0 };
  const next = { ...prev };
  for (const [k, v] of Object.entries(add) as [keyof Omit<DayRow, 'day'>, number][]) next[k] += v;
  return { ...s, days: new Map(s.days).set(day, next) };
}

/**
 * Состояние карточки. `count: false` — правка из словаря («знаю», «вернуть»):
 * это не занятие, в счётчик дня она не идёт.
 */
export function useSaveCard() {
  return useStateMutation(
    ({ cardId, state, count = true }: { cardId: string; state: CardState; count?: boolean }) =>
      apiJson(
        `${BASE}/cards`,
        send('PUT', {
          cardId,
          ...state,
          due: new Date(state.due).toISOString(),
          firstAt: new Date(state.firstAt).toISOString(),
          ...(count ? { day: localDay(Date.now()) } : {}),
        }),
      ),
    (s, { cardId, state, count = true }) => {
      const next = { ...s, cards: new Map(s.cards).set(cardId, state) };
      return count ? bumpDay(next, { cards: 1 }) : next;
    },
  );
}

export function useSetLesson() {
  return useStateMutation(
    ({ id, done }: { id: string; done: boolean }) =>
      apiJson(`${BASE}/lessons/${encodeURIComponent(id)}`, send('PUT', { done })),
    (s, { id, done }) => {
      const lessons = new Set(s.lessons);
      const lessonDates = new Map(s.lessonDates);
      if (done) {
        lessons.add(id);
        lessonDates.set(id, Date.now());
      } else {
        lessons.delete(id);
        lessonDates.delete(id);
      }
      return { ...s, lessons, lessonDates };
    },
  );
}

export function useAnswer() {
  return useStateMutation(
    (a: { itemId: string; unit: string; correct: boolean }) =>
      apiJson(`${BASE}/answers`, send('POST', { ...a, day: localDay(Date.now()) })),
    (s, { itemId, unit, correct }) => {
      const prev = s.answers.get(itemId);
      const row: AnswerRow = {
        itemId,
        unit,
        right: (prev?.right ?? 0) + (correct ? 1 : 0),
        wrong: (prev?.wrong ?? 0) + (correct ? 0 : 1),
        lastCorrect: correct,
      };
      return bumpDay({ ...s, answers: new Map(s.answers).set(itemId, row) }, { answers: 1, correct: correct ? 1 : 0 });
    },
  );
}

/** Фраза диктанта или произношения сделана — в счётчик дня. */
export function usePhraseDone() {
  return useStateMutation<void>(
    () => apiJson(`${BASE}/phrases`, send('POST', { day: localDay(Date.now()) })),
    (s) => bumpDay(s, { phrases: 1 }),
  );
}

/** Своё слово: id выдаёт сервер, поэтому в кэш оно ложится по ответу, а не заранее. */
export function useAddWord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (w: { en: string; ru: string }) => apiJson<CustomWord>(`${BASE}/words`, send('POST', w)),
    onSuccess: (word) =>
      qc.setQueryData<EnglishState>(KEY, (s) => (s ? { ...s, words: [...s.words, word] } : s)),
  });
}

export function useDeleteWord() {
  return useStateMutation(
    (id: string) => apiJson(`${BASE}/words/${encodeURIComponent(id)}`, send('DELETE')),
    (s, id) => {
      const cardId = myCardId(id);
      const cards = new Map(s.cards);
      cards.delete(cardId);
      return {
        ...s,
        cards,
        words: s.words.filter((w) => w.id !== id),
        themes: s.themes.map((t) => ({ ...t, cards: t.cards.filter((c) => c !== cardId) })),
      };
    },
  );
}

/** Своя тема: id выдаёт сервер — в кэш по ответу. */
export function useAddTheme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => apiJson<UserTheme>(`${BASE}/themes`, send('POST', { title })),
    onSuccess: (theme) =>
      qc.setQueryData<EnglishState>(KEY, (s) => (s ? { ...s, themes: [...s.themes, theme] } : s)),
  });
}

export function useDeleteTheme() {
  return useStateMutation(
    (id: string) => apiJson(`${BASE}/themes/${encodeURIComponent(id)}`, send('DELETE')),
    (s, id) => ({ ...s, themes: s.themes.filter((t) => t.id !== id) }),
  );
}

/** Слово в свою тему (`on`) или из неё. */
export function useThemeWord() {
  return useStateMutation(
    ({ themeId, cardId, on }: { themeId: string; cardId: string; on: boolean }) =>
      apiJson(`${BASE}/themes/${encodeURIComponent(themeId)}/words`, send('PUT', { cardId, on })),
    (s, { themeId, cardId, on }) => ({
      ...s,
      themes: s.themes.map((t) =>
        t.id !== themeId
          ? t
          : { ...t, cards: on ? [...new Set([...t.cards, cardId])] : t.cards.filter((c) => c !== cardId) },
      ),
    }),
  );
}
