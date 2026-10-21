'use client';

import { useEffect, useMemo, useState } from 'react';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { PageHead } from '@/shared/ui/PageHead';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import { dateFormat } from '@/shared/lib/utils/intl';
import { useEnglishState, type EnglishState } from './api/hooks';
import { Calendar } from './components/today/Calendar';
import { DoneLessons } from './components/today/DoneLessons';
import { PlanRow } from './components/today/PlanRow';
import { Summary } from './components/today/Summary';
import { COURSE, EXERCISES, WORDS } from './content';
import { VOCAB } from './content/vocab';
import { activityOf, localDay, streak } from './model/activity';
import { currentSection, openUnits } from './model/course';
import { catalog, deckOf, queue } from './model/deck';
import { GOAL_ANSWERS, GOAL_PHRASES, mistakeCount, plural, practiceTarget } from './model/today';

// Те же ключи и значения по умолчанию, что у страницы карточек: очередь здесь — её очередь.
const NEW_LIMITS = [10, 20, 50] as const;
const decodeLimit = (raw: string | null) => {
  const n = Number(raw);
  return (NEW_LIMITS as readonly number[]).includes(n) ? n : 20;
};
const encodeLimit = (v: number) => String(v);
const decodeDeck = (raw: string | null) => raw || 'all';
const encodeDeck = (v: string) => v;

/** Сегодня: план дня, серия, календарь и пройденные уроки. */
export function TodayPage() {
  const state = useEnglishState();
  return state.data ? (
    <Today data={state.data} error={state.error} />
  ) : (
    <>
      <PageHead title="Сегодня" />
      <ErrorNote error={state.error} fallback="Не удалось загрузить прогресс" />
      <SkeletonLines widths={[100, 100, 100, 60]} />
    </>
  );
}

function Today({ data, error }: { data: EnglishState; error: unknown }) {
  const [newLimit] = usePersistentValue<number>('virex.english.newPerDay', decodeLimit, 20, encodeLimit);
  const [deckSpec] = usePersistentValue<string>('virex.english.deck', decodeDeck, 'all', encodeDeck);

  // «Сейчас» — момент входа и возврата на вкладку: приложение на телефоне лежит
  // открытым до утра, и без этого «сегодня» осталось бы вчерашним.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const today = localDay(now);
  const row = data.days.get(today);
  const run = streak(data.days, today);

  const deck = useMemo(
    () => deckOf(catalog(WORDS, VOCAB, data.words), deckSpec, openUnits(COURSE, data.lessons), data.themes),
    [data.words, data.lessons, data.themes, deckSpec],
  );
  const q = useMemo(() => queue(deck, data.cards, now, newLimit), [deck, data.cards, now, newLimit]);
  const deckEmpty = deck.length === 0;
  const repeat = q.due.length + q.ahead.length;

  const lesson = currentSection(COURSE, data.lessons);
  const lessonToday = [...data.lessonDates.values()].some((t) => localDay(t) === today);
  const target = practiceTarget(COURSE, data.lessons, EXERCISES);
  const answersToday = row?.answers ?? 0;
  const phrasesToday = row?.phrases ?? 0;
  const mistakes = mistakeCount(EXERCISES, data.answers);

  let known = 0;
  let learning = 0;
  for (const s of data.cards.values()) {
    if (s.known) known += 1;
    else learning += 1;
  }
  const lessonsDone = COURSE.filter((s) => data.lessons.has(s.id)).length;
  const activeDays = [...data.days.values()].filter((d) => activityOf(d) > 0).length;

  const date = dateFormat('ru', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(now));

  return (
    <>
      <PageHead
        title="Сегодня"
        lede={`${date} · ${run > 0 ? `${run} ${plural(run, ['день', 'дня', 'дней'])} подряд` : 'серия начнётся с первого занятия'}`}
      />
      <ErrorNote error={error} fallback="Не удалось загрузить прогресс" />

      <ul className="en-plan">
        <PlanRow
          href="/english/cards"
          title="Карточки"
          status={deckEmpty ? 'колода пуста' : `повторить ${repeat} · новых ${q.fresh.length}`}
          done={!deckEmpty && repeat === 0 && q.fresh.length === 0}
        />
        <PlanRow
          href="/english/lessons"
          title="Урок"
          status={lesson ? lesson.title : 'курс пройден'}
          done={lessonToday}
        />
        <PlanRow
          href={target ? `/english/practice?unit=${target.id}` : '/english/practice'}
          title="Практика"
          status={`заданий сегодня ${answersToday} из ${GOAL_ANSWERS}`}
          done={answersToday >= GOAL_ANSWERS}
        />
        {mistakes > 0 ? (
          <PlanRow href="/english/practice?unit=mistakes" title="Работа над ошибками" status={`ошибок ${mistakes}`} />
        ) : null}
        <PlanRow
          href="/english/speak"
          title="Слух и речь"
          status={`фраз сегодня ${phrasesToday} из ${GOAL_PHRASES}`}
          done={phrasesToday >= GOAL_PHRASES}
        />
      </ul>

      <Summary
        items={[
          { label: 'Слов знаю', value: String(known) },
          { label: 'Изучаю', value: String(learning) },
          { label: 'Уроков пройдено', value: `${lessonsDone} из ${COURSE.length}` },
          { label: 'Дней с занятиями', value: String(activeDays) },
        ]}
      />

      <section className="en-section">
        <h3>Календарь</h3>
        <Calendar today={today} days={data.days} />
      </section>

      <section className="en-section">
        <h3>Пройденные уроки</h3>
        <DoneLessons dates={data.lessonDates} />
      </section>
    </>
  );
}
