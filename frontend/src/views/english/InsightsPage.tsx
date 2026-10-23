'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { PageHead } from '@/shared/ui/PageHead';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import { cn } from '@/shared/lib/utils/css';
import { dateFormat } from '@/shared/lib/utils/intl';
import { useAddTheme, useEnglishState, type EnglishState } from './api/hooks';
import { Say } from './components/Say';
import { Summary } from './components/today/Summary';
import { COURSE, EXERCISES, WORDS } from './content';
import { ALL_VOCAB, VOCAB } from './content/vocab';
import { localDay } from './model/activity';
import { currentSection } from './model/course';
import { catalog } from './model/deck';
import {
  WINDOW,
  accuracy,
  activityMix,
  advise,
  byType,
  coverage,
  dueCount,
  hardWords,
  missingWords,
  retention,
  speakStage,
  themeGaps,
  weakUnits,
  wordSets,
  type Advice,
  type Reason,
  type Score,
} from './model/insights';
import { mistakeCount, plural } from './model/today';

const decodeDeck = (raw: string | null) => raw || 'all';
const encodeDeck = (v: string) => v;

const TOPS = [100, 500, 1000, 2000] as const;

const REASON: Record<Reason, string> = {
  mistake: 'из ошибок',
  book: 'пройденный урок',
  speak: 'для разговора',
  frequent: 'частое',
};

const TYPE_LABEL = {
  choice: 'Выбор варианта — узнавание',
  gap: 'Пропуск — форма слова',
  order: 'Сборка фразы — порядок слов',
  translate: 'Перевод — своя фраза',
} as const;

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)} %`);

/**
 * Разбор: анализ всех занятий раздела и рекомендации — какие слова учить и что
 * делать, чтобы заговорить. Считается на месте из того же состояния, что у
 * остальных вкладок (`model/insights.ts`).
 */
export function InsightsPage() {
  const state = useEnglishState();
  return (
    <>
      <PageHead
        title="Разбор"
        lede={`Что получается, где провалы и что учить дальше. Занятия — за последние ${WINDOW} дней, слова и задания — за всё время.`}
      />
      <ErrorNote error={state.error} fallback="Не удалось загрузить прогресс" />
      {state.data ? <Insights data={state.data} /> : <SkeletonLines widths={[100, 100, 60, 100]} />}
    </>
  );
}

function Insights({ data }: { data: EnglishState }) {
  const router = useRouter();
  const addTheme = useAddTheme();
  const [, setDeck] = usePersistentValue<string>('virex.english.deck', decodeDeck, 'all', encodeDeck);
  const [now] = useState(() => Date.now());
  const today = localDay(now);

  const a = useMemo(() => {
    const cards = catalog(WORDS, VOCAB, data.words);
    const { settled, started } = wordSets(cards, data.cards);
    const lastLessonAt = data.lessonDates.size ? Math.max(...data.lessonDates.values()) : null;
    const bands = coverage(ALL_VOCAB, settled, TOPS);
    const mix = activityMix(data.days, today);
    const types = byType(EXERCISES, data.answers);
    const weak = weakUnits(COURSE, EXERCISES, data.answers);
    const hard = hardWords(cards, data.cards);
    const gaps = themeGaps(cards, data.cards);
    const due = dueCount(data.cards, now);
    const ret = retention(data.cards);
    const mistakes = mistakeCount(EXERCISES, data.answers);
    const missing = missingWords({
      cards,
      states: data.cards,
      vocab: ALL_VOCAB,
      exercises: EXERCISES,
      answers: data.answers,
      done: data.lessons,
    });
    const advice = advise({
      now,
      mix,
      settled: settled.size,
      top500: bands[1],
      types,
      weak,
      hard: hard.length,
      due,
      retention: ret,
      mistakes,
      current: currentSection(COURSE, data.lessons),
      lastLessonAt,
      gaps,
    });
    return { settled: settled.size, started: started.size, bands, mix, types, weak, hard, gaps, due, ret, missing, advice };
  }, [data, now, today]);

  const learnDeck = (spec: string) => {
    setDeck(spec);
    router.push('/english/cards');
  };

  const learnMissing = () => {
    const date = dateFormat('ru', { day: 'numeric', month: 'short' }).format(new Date(now));
    addTheme.mutate(
      { title: `Разбор ${date}: не хватает`, cards: a.missing.map((m) => m.card.id) },
      { onSuccess: (theme) => learnDeck(`mine:${theme.id}`) },
    );
  };

  const stage = speakStage(a.settled);
  const empty = a.started === 0 && data.answers.size === 0 && a.mix.total === 0;

  if (empty) {
    return (
      <EmptyState title="Разбирать пока нечего">
        Разбор строится по занятиям: пройди урок, ответь на задания и поучи карточки — и здесь появятся выводы и подборка
        слов. <Link href="/english">План на сегодня</Link>
      </EmptyState>
    );
  }

  return (
    <div className="en-ins">
      <section className="en-ins-hero">
        <p className="en-hub-big">
          <b>{a.settled}</b>
          <span className="muted"> слов усвоено · начато {a.started}</span>
        </p>
        <p className="en-ins-stage">
          Хватает на {stage.title}.
          {stage.next ? <span className="muted"> Следующая ступень — {stage.next} слов.</span> : null}
        </p>
        <ul className="en-ins-bands">
          {a.bands.map((b) => (
            <li key={b.top}>
              <span className="en-ins-band-label muted">
                Из {b.top} самых частых — <b>{b.settled}</b> ({Math.round((b.settled / b.top) * 100)} %)
              </span>
              <span className="en-tprog" aria-hidden>
                <span className="en-tprog-known" style={{ width: `${(b.settled / b.top) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
        <p className="en-ins-note muted">
          Усвоено — «знаю» или повторение раз в неделю и реже. Первая тысяча частых слов — около 80 % слов бытового
          разговора.
        </p>
      </section>

      <Summary
        items={[
          { label: `Дней из ${WINDOW}`, value: String(a.mix.activeDays) },
          { label: 'Карточек', value: String(a.mix.cards + a.mix.quiz) },
          { label: 'Заданий', value: `${a.mix.answers} · ${pct(accuracy({ right: a.mix.correct, wrong: a.mix.answers - a.mix.correct }))}` },
          { label: 'Фраз вслух', value: String(a.mix.phrases) },
        ]}
      />
      <Balance mix={a.mix} />

      <section className="en-section">
        <h3>Рекомендации</h3>
        <ol className="en-advice">
          {a.advice.map((adv) => (
            <AdviceRow key={adv.id} advice={adv} onDeck={learnDeck} />
          ))}
        </ol>
      </section>

      <section className="en-section">
        <h3>Слова, которых не хватает</h3>
        {a.missing.length === 0 ? (
          <p className="muted">Все частые слова уже в работе — добавляй свои из разговоров в «Мои слова».</p>
        ) : (
          <>
            <p className="en-ins-note muted">
              Сначала — слова из заданий с ошибкой и из пройденных уроков, потом самые частые слова разговорных тем.
              Уже начатые в карточках сюда не попадают.
            </p>
            <ul className="en-wlist en-ins-words">
              {a.missing.map((m) => (
                <li key={m.card.id} className="en-w">
                  <span className="en-w-word en-phrase">
                    <span lang="en">{m.card.en}</span>
                    <Say text={m.card.en} />
                  </span>
                  <span className="en-w-ru">{m.card.ru}</span>
                  <span className="en-w-status muted">{REASON[m.reason]}</span>
                </li>
              ))}
            </ul>
            <div className="en-ins-cta">
              <Button variant="solid" disabled={addTheme.isPending} onClick={learnMissing}>
                Учить {a.missing.length} {plural(a.missing.length, ['слово', 'слова', 'слов'])}
              </Button>
              <span className="muted">Создаст свою тему и откроет её карточками.</span>
            </div>
            <ErrorNote error={addTheme.error} fallback="Не удалось создать тему" />
          </>
        )}
      </section>

      {a.hard.length > 0 ? (
        <section className="en-section">
          <h3>Трудные слова</h3>
          <ul className="en-wlist">
            {a.hard.map(({ card, state }) => (
              <li key={card.id} className="en-w">
                <span className="en-w-word en-phrase">
                  <span lang="en">{card.en}</span>
                  <Say text={card.en} />
                </span>
                <span className="en-w-ru">
                  {card.ru}
                  {card.example ? <span className="en-ins-ex muted" lang="en"> · {card.example[0]}</span> : null}
                </span>
                <span className="en-w-status neg">забыто {state.lapses}×</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="en-section">
        <h3>Задания по видам</h3>
        <ul className="en-ins-types">
          {(Object.keys(TYPE_LABEL) as (keyof typeof TYPE_LABEL)[]).map((t) => (
            <ScoreRow key={t} label={TYPE_LABEL[t]} score={a.types[t]} />
          ))}
        </ul>
        {a.weak.length > 0 ? (
          <>
            <h4 className="en-ins-sub">Слабые уроки</h4>
            <ul className="en-ins-types">
              {a.weak.map((w) => (
                <li key={w.section.id}>
                  <Link href={`/english/practice?unit=${w.section.id}`} className="en-ins-type-label">
                    {w.section.title} <span className="muted">· {w.section.topic}</span>
                  </Link>
                  <span className="en-ins-type-val neg">{pct(accuracy(w.score))}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="en-section">
        <h3>Темы для разговора</h3>
        <ul className="en-ins-types">
          {a.gaps.slice(0, 8).map((g) => (
            <li key={g.id}>
              <button type="button" className="en-ins-type-label en-ins-link" onClick={() => learnDeck(`theme:${g.id}`)}>
                {g.title}
              </button>
              <span className="en-ins-type-val muted">
                {g.settled} из {g.total}
              </span>
            </li>
          ))}
        </ul>
        <p className="en-ins-note muted">Самые пустые сверху; нажми тему, чтобы учить её карточками.</p>
      </section>
    </div>
  );
}

/** Доля каждого вида занятий — полосой: видно, чего в занятиях нет. */
function Balance({ mix }: { mix: ReturnType<typeof activityMix> }) {
  if (mix.total === 0) return null;
  const parts = [
    { key: 'cards', label: 'карточки и тесты', n: mix.cards + mix.quiz },
    { key: 'answers', label: 'задания', n: mix.answers },
    { key: 'phrases', label: 'слух и речь', n: mix.phrases },
  ];
  return (
    <div className="en-ins-balance">
      <span className="en-ins-bar" aria-hidden>
        {parts.map((p) => (
          <span key={p.key} className={`en-ins-bar-${p.key}`} style={{ width: `${(p.n / mix.total) * 100}%` }} />
        ))}
      </span>
      <span className="en-ins-legend muted">
        {parts.map((p) => (
          <span key={p.key}>
            <i className={`en-ins-dot en-ins-bar-${p.key}`} aria-hidden />
            {p.label} {Math.round((p.n / mix.total) * 100)} %
          </span>
        ))}
      </span>
    </div>
  );
}

function ScoreRow({ label, score }: { label: string; score: Score }) {
  const acc = accuracy(score);
  return (
    <li>
      <span className="en-ins-type-label">{label}</span>
      <span className={cn('en-ins-type-val', acc === null ? 'muted' : acc < 0.7 ? 'neg' : acc >= 0.85 ? 'pos' : '')}>
        {pct(acc)}
        <span className="muted"> · {score.right + score.wrong}</span>
      </span>
    </li>
  );
}

function AdviceRow({ advice, onDeck }: { advice: Advice; onDeck: (spec: string) => void }) {
  return (
    <li className={cn('en-adv', `is-${advice.level}`)}>
      <span className="en-adv-title">{advice.title}</span>
      <span className="en-adv-text muted">{advice.text}</span>
      {advice.action && (advice.deck || advice.href) ? (
        <span className="en-adv-act">
          {advice.deck ? (
            <Button onClick={() => onDeck(advice.deck ?? '')}>{advice.action}</Button>
          ) : (
            <Link href={advice.href ?? '/english'} className="btn">
              {advice.action}
            </Link>
          )}
        </span>
      ) : null}
    </li>
  );
}
