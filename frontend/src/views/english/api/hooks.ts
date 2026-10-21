'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';
import type { AnswerRow } from '../model/course';
import { myCardId, type CustomWord } from '../model/deck';
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
}

interface StateResponse {
  cards: CardRow[];
  words: CustomWord[];
  lessons: string[];
  answers: AnswerRow[];
}

/** Состояние в форме, удобной страницам: карточки и ответы — по id, уроки — набором. */
export interface EnglishState {
  cards: ReadonlyMap<string, CardState>;
  words: CustomWord[];
  lessons: ReadonlySet<string>;
  answers: ReadonlyMap<string, AnswerRow>;
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
      },
    ]),
  ),
  words: r.words,
  lessons: new Set(r.lessons),
  answers: new Map(r.answers.map((a) => [a.itemId, a])),
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

export function useSaveCard() {
  return useStateMutation(
    ({ cardId, state }: { cardId: string; state: CardState }) =>
      apiJson(
        `${BASE}/cards`,
        send('PUT', {
          cardId,
          ...state,
          due: new Date(state.due).toISOString(),
          firstAt: new Date(state.firstAt).toISOString(),
        }),
      ),
    (s, { cardId, state }) => ({ ...s, cards: new Map(s.cards).set(cardId, state) }),
  );
}

export function useSetLesson() {
  return useStateMutation(
    ({ id, done }: { id: string; done: boolean }) =>
      apiJson(`${BASE}/lessons/${encodeURIComponent(id)}`, send('PUT', { done })),
    (s, { id, done }) => {
      const lessons = new Set(s.lessons);
      if (done) lessons.add(id);
      else lessons.delete(id);
      return { ...s, lessons };
    },
  );
}

export function useAnswer() {
  return useStateMutation(
    (a: { itemId: string; unit: string; correct: boolean }) => apiJson(`${BASE}/answers`, send('POST', a)),
    (s, { itemId, unit, correct }) => {
      const prev = s.answers.get(itemId);
      const row: AnswerRow = {
        itemId,
        unit,
        right: (prev?.right ?? 0) + (correct ? 1 : 0),
        wrong: (prev?.wrong ?? 0) + (correct ? 0 : 1),
        lastCorrect: correct,
      };
      return { ...s, answers: new Map(s.answers).set(itemId, row) };
    },
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
      const cards = new Map(s.cards);
      cards.delete(myCardId(id));
      return { ...s, cards, words: s.words.filter((w) => w.id !== id) };
    },
  );
}
