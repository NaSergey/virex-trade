'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Input, Select } from '@/shared/ui/Field';
import { PageHead } from '@/shared/ui/PageHead';
import { Pagination } from '@/shared/ui/Pagination';
import { Seg } from '@/shared/ui/Seg';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import { useEnglishState, useSaveCard, useThemeWord, type EnglishState } from './api/hooks';
import { ThemeHub } from './components/words/ThemeHub';
import { Themes } from './components/words/Themes';
import { WordRow } from './components/words/WordRow';
import { COURSE, WORDS } from './content';
import { THEMES } from './content/themes';
import { VOCAB } from './content/vocab';
import { catalog, deckOf, statusOf, type DeckCard } from './model/deck';
import { relearn, review } from './model/srs';
import { byStatus, countStatuses, matchQuery, type StatusFilter } from './model/words';

const PAGE_SIZE = 50;
const ALL_UNITS: ReadonlySet<string> = new Set(COURSE.map((s) => s.id));
const decodeDeck = (raw: string | null) => raw || 'all';
const encodeDeck = (v: string) => v;

type View = 'themes' | 'list';

/**
 * Темы и слова. Первым — темы с прогрессом: выбрать тему, учить её карточками
 * или пройти тест; вторым видом — все слова списком со статусом и действиями.
 */
export function WordsPage() {
  const state = useEnglishState();
  return (
    <>
      <PageHead title="Темы и слова" lede="Выбери тему разговора — учи её карточками или проверь себя тестом. «Знаю» убирает слово из карточек." />
      <ErrorNote error={state.error} fallback="Не удалось загрузить прогресс" />
      {state.data ? <Words data={state.data} /> : <SkeletonLines widths={[100, 100, 60]} />}
    </>
  );
}

function Words({ data }: { data: EnglishState }) {
  const router = useRouter();
  const save = useSaveCard();
  const themeWord = useThemeWord();
  const [, setDeck] = usePersistentValue<string>('virex.english.deck', decodeDeck, 'all', encodeDeck);
  const [view, setView] = useState<View>('themes');
  const [spec, setSpec] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [paging, setPaging] = useState({ key: '', page: 1 });

  const cards = useMemo(() => catalog(WORDS, VOCAB, data.words), [data.words]);
  // Учебник — целиком, а не только открытые разделы: словарь показывает всё.
  const pool = useMemo(() => deckOf(cards, spec, ALL_UNITS, data.themes), [cards, spec, data.themes]);
  const found = useMemo(() => matchQuery(pool, query), [pool, query]);
  const counts = useMemo(() => countStatuses(found, data.cards), [found, data.cards]);
  const list = useMemo(() => byStatus(found, data.cards, status), [found, data.cards, status]);

  // Смена фильтра возвращает на первый лист: ключ листа — сами фильтры.
  const filterKey = `${spec}|${status}|${query}`;
  const page = paging.key === filterKey ? paging.page : 1;
  const lastPage = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const shown = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const go = (p: number) => setPaging({ key: filterKey, page: Math.min(lastPage, Math.max(1, p)) });

  const mineId = spec.startsWith('mine:') ? spec.slice(5) : null;

  const know = (c: DeckCard) =>
    save.mutate({ cardId: c.id, state: review(data.cards.get(c.id) ?? null, 3, Date.now()), count: false });
  const learnAgain = (c: DeckCard) =>
    save.mutate({ cardId: c.id, state: relearn(data.cards.get(c.id) ?? null, Date.now()), count: false });
  const toTheme = (c: DeckCard, themeId: string) => themeWord.mutate({ themeId, cardId: c.id, on: true });
  const outOfTheme = (c: DeckCard) => {
    if (mineId) themeWord.mutate({ themeId: mineId, cardId: c.id, on: false });
  };

  const learnSpec = (s: string) => {
    setDeck(s);
    router.push('/english/cards');
  };
  const learn = () => learnSpec(spec);
  const test = (s: string) => router.push(`/english/test?deck=${encodeURIComponent(s)}`);
  const browse = (s: string) => {
    setSpec(s);
    setStatus('all');
    setView('list');
  };

  const viewSeg = (
    <Seg<View>
      ariaLabel="Вид"
      className="en-wview"
      options={[
        { value: 'themes', label: 'Темы' },
        { value: 'list', label: 'Все слова' },
      ]}
      value={view}
      onChange={setView}
    />
  );

  if (view === 'themes') {
    return (
      <div className="en-words">
        {viewSeg}
        <ThemeHub data={data} cards={cards} onLearn={learnSpec} onTest={test} onBrowse={browse} />
      </div>
    );
  }

  return (
    <div className="en-words">
      {viewSeg}
      <div className="en-wfilters">
        <Input
          type="search"
          className="en-wsearch"
          placeholder="Поиск по слову или переводу"
          aria-label="Поиск"
          autoCapitalize="none"
          autoCorrect="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select aria-label="Подборка" value={spec} onChange={(e) => setSpec(e.target.value)}>
          <option value="all">Все слова</option>
          <option value="my">Мои слова</option>
          <option value="book">Учебник</option>
          <option value="vocab">Общий словарь</option>
          {data.themes.length > 0 ? (
            <optgroup label="Мои темы">
              {data.themes.map((t) => (
                <option key={t.id} value={`mine:${t.id}`}>
                  {t.title}
                </option>
              ))}
            </optgroup>
          ) : null}
          <optgroup label="Темы словаря">
            {THEMES.map((t) => (
              <option key={t.id} value={`theme:${t.id}`}>
                {t.title}
              </option>
            ))}
          </optgroup>
        </Select>
        <Seg<StatusFilter>
          ariaLabel="Статус"
          options={[
            { value: 'all', label: `Все ${counts.all}` },
            { value: 'learning', label: `Изучаю ${counts.learning}` },
            { value: 'known', label: `Знаю ${counts.known}` },
            { value: 'new', label: `Новые ${counts.new}` },
          ]}
          value={status}
          onChange={setStatus}
        />
        <Button variant="solid" className="en-wlearn" disabled={pool.length === 0} onClick={learn}>
          Учить эти слова
        </Button>
        <Button className="en-wlearn" disabled={pool.length === 0} onClick={() => test(spec)}>
          Тест
        </Button>
      </div>

      <Themes
        themes={data.themes}
        selectedId={mineId}
        onSelect={(id) => setSpec(`mine:${id}`)}
        onDeleted={(id) => {
          if (spec === `mine:${id}`) setSpec('all');
        }}
      />

      <ErrorNote error={save.error ?? themeWord.error} fallback="Не удалось сохранить" />

      {list.length === 0 ? (
        <EmptyState title="Ничего не нашлось">
          {mineId && pool.length === 0
            ? 'В этой теме пока нет слов: в других подборках нажми «В тему» у нужного слова.'
            : 'Попробуй другой запрос, статус или подборку.'}
        </EmptyState>
      ) : (
        <>
          <ul className="en-wlist">
            {shown.map((c) => (
              <WordRow
                key={c.id}
                card={c}
                status={statusOf(data.cards.get(c.id))}
                themes={data.themes}
                fromTheme={mineId !== null}
                onKnow={know}
                onRelearn={learnAgain}
                onToTheme={toTheme}
                onOutOfTheme={outOfTheme}
              />
            ))}
          </ul>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={list.length}
            onPrev={() => go(page - 1)}
            onNext={() => go(page + 1)}
          />
        </>
      )}
    </div>
  );
}
