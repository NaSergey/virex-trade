'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { PageHead } from '@/shared/ui/PageHead';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import {
  useAnswer,
  useEnglishState,
  useGameDone,
  usePhraseDone,
  useRuns,
  useSaveCard,
  useSaveRun,
  type EnglishState,
  type RunRow,
} from '../api/hooks';
import { Blocks } from '../components/Blocks';
import { COURSE, LESSONS, WORDS } from '../content';
import { VOCAB } from '../content/vocab';
import { localDay } from '../model/activity';
import { openUnits } from '../model/course';
import { catalog, deckOf, queue } from '../model/deck';
import { canListen } from '../model/speech';
import { CHARACTER_IDS, type CharacterId } from './content/characters';
import { FightView } from './components/FightView';
import { Hub } from './components/Hub';
import { LineMap } from './components/LineMap';
import { Results } from './components/Results';
import { SceneView } from './components/SceneView';
import { StatusBar } from './components/StatusBar';
import { Find, Rest, Review, Reward, Shop } from './components/Stops';
import type { Action, RunState } from './model/engine';
import {
  availableCharacters,
  availableRelics,
  gameStreak,
  goldDays,
  maxFog,
  questProgress,
  questsOf,
  statsOfDay,
  unlocked,
  weatherOf,
} from './model/meta';
import { fogCount } from './model/run-deck';
import { sceneLevels } from './model/scene';
import { playSound } from './sound';
import { pendingRuns, setPendingRuns, useRun } from './useRun';
import './game.css';

// Те же ключи и значения по умолчанию, что у «Карточек» и «Сегодня»: колода игры — их колода.
const NEW_LIMITS = [10, 20, 50] as const;
const decodeLimit = (raw: string | null) => {
  const n = Number(raw);
  return (NEW_LIMITS as readonly number[]).includes(n) ? n : 20;
};
const decodeDeck = (raw: string | null) => raw || 'all';
const decodeCharacter = (raw: string | null): CharacterId =>
  CHARACTER_IDS.includes(raw as CharacterId) ? (raw as CharacterId) : 'tourist';
const decodeFog = (raw: string | null) => Math.max(0, Math.min(8, Number(raw) || 0));
const asString = (v: string | number) => String(v);

/** Игра «Mind the Gap» (спека docs/superpowers/specs/2026-11-04-english-game-design.md). */
export function GamePage() {
  const state = useEnglishState();
  const runs = useRuns();
  if (state.data && runs.data) return <Game data={state.data} runs={runs.data} />;
  return (
    <>
      <PageHead title="Mind the Gap" />
      <ErrorNote error={state.error ?? runs.error} fallback="Не удалось загрузить прогресс" />
      <SkeletonLines widths={[100, 100, 60]} />
    </>
  );
}

const randomId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

function Game({ data, runs }: { data: EnglishState; runs: RunRow[] }) {
  const [newLimit] = usePersistentValue<number>('virex.english.newPerDay', decodeLimit, 20, asString);
  const [deckSpec] = usePersistentValue<string>('virex.english.deck', decodeDeck, 'all', asString);
  const [character, setCharacter] = usePersistentValue<CharacterId>('virex.english.game.character', decodeCharacter, 'tourist', asString);
  const [fogPick, setFog] = usePersistentValue<number>('virex.english.game.fog', decodeFog, 0, asString);

  // «Сейчас» — момент входа и возврата на вкладку, как на «Сегодня».
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  const today = localDay(now);
  const speech = canListen();

  const open = useMemo(() => openUnits(COURSE, data.lessons), [data.lessons]);
  const deck = useMemo(
    () => deckOf(catalog(WORDS, VOCAB, data.words), deckSpec, open, data.themes),
    [data.words, deckSpec, open, data.themes],
  );
  const q = useMemo(() => queue(deck, data.cards, now, newLimit), [deck, data.cards, now, newLimit]);
  const quests = useMemo(() => questsOf(today, runs, speech, q.fresh.length > 0), [today, runs, speech, q.fresh.length]);
  const levels = useMemo(() => sceneLevels(runs), [runs]);
  const chars = availableCharacters(runs, speech);
  const top = maxFog(runs);
  const fog = Math.min(fogPick, top);
  const pick = chars.includes(character) ? character : 'tourist';

  const saveCard = useSaveCard();
  const answer = useAnswer();
  const gameDone = useGameDone();
  const phraseDone = usePhraseDone();
  const saveRun = useSaveRun();

  // Оценка карточки — по её состоянию сейчас: реф читает свежий кэш, а не тот, что был на старте забега.
  const cards = useRef(data.cards);
  useLayoutEffect(() => {
    cards.current = data.cards;
  });

  const { run, dispatch, start, discard } = useRun({
    effects: {
      stateOf: (id) => cards.current.get(id),
      saveCard: (cardId, st) => saveCard.mutate({ cardId, state: st }),
      answer: (itemId, unit, correct) => answer.mutate({ itemId, unit, correct }),
      count: (counter) => (counter === 'phrases' ? phraseDone.mutate() : gameDone.mutate()),
      sound: playSound,
    },
    questsDone: (s) => {
      const day = localDay(Date.now());
      const stats = [...statsOfDay(runs, day), s.stats];
      return questsOf(day, runs, speech, q.fresh.length > 0)
        .filter((x) => questProgress(x, stats) >= x.target)
        .map((x) => x.id);
    },
    save: (row) =>
      saveRun.mutate(row, {
        onError: () => setPendingRuns([...pendingRuns().filter((r) => r.id !== row.id), row]),
      }),
  });

  // Забеги, не ушедшие с первого раза, досылаются при открытии игры.
  const flushed = useRef(false);
  useEffect(() => {
    if (flushed.current) return;
    flushed.current = true;
    for (const row of pendingRuns()) {
      saveRun.mutate(row, { onSuccess: () => setPendingRuns(pendingRuns().filter((r) => r.id !== row.id)) });
    }
  }, [saveRun]);

  const begin = () =>
    start({
      id: randomId(),
      seed: Math.floor(Math.random() * 2 ** 31),
      now: Date.now(),
      day: today,
      weather: weatherOf(today),
      character: pick,
      fog,
      speech,
      deck,
      states: data.cards,
      newLimit,
      lessons: data.lessons,
      relics: availableRelics(runs, speech),
      scenes: {
        open: [...open],
        levels: Object.fromEntries(levels),
        recent: runs.slice(0, 2).flatMap((r) => (r.stats.scenes ?? []).map((s) => s.id)),
      },
    });

  if (run) {
    if (run.outcome) {
      const before = runs.filter((r) => r.id !== run.id);
      const day = localDay(run.finishedAt ?? now);
      return (
        <div className="eg eg-run">
          <Results
            run={run}
            before={before}
            quests={quests}
            todayStats={[...statsOfDay(before, day), run.stats]}
            onAgain={() => {
              discard();
              begin();
            }}
            onHub={discard}
          />
        </div>
      );
    }
    return <RunView run={run} dispatch={dispatch} />;
  }

  return (
    <div className="eg eg-hub">
      <Hub
        runs={runs}
        fog={fogCount(deck, data.cards, now)}
        newLeft={q.fresh.length}
        weather={weatherOf(today)}
        quests={quests}
        todayStats={statsOfDay(runs, today)}
        streak={gameStreak(runs, today)}
        strip={goldDays(runs, today, 14)}
        characters={chars}
        character={pick}
        onCharacter={setCharacter}
        maxFog={top}
        fogLevel={fog}
        onFog={setFog}
        open={open}
        levels={levels}
        unlocked={unlocked(runs)}
        onStart={begin}
      />
    </div>
  );
}

function BossIntro({ run, dispatch }: { run: RunState; dispatch: (a: Action) => void }) {
  const [rules, setRules] = useState(false);
  const blocks = run.boss.units.flatMap((u) => (LESSONS.get(u)?.blocks ?? []).filter((b) => b.type === 'rule' || b.type === 'note'));
  return (
    <section className="eg-stop eg-boss-intro">
      <p className="eg-task">Конец линии · хранитель</p>
      <h2>{run.boss.name}</h2>
      <p>Держит туман грамматикой: {run.boss.grammar}.</p>
      <div className="eg-row">
        <Button variant="solid" onClick={() => dispatch({ type: 'next', now: Date.now() })}>
          В бой
        </Button>
        {blocks.length > 0 ? (
          <Button variant="default" onClick={() => setRules(!rules)} aria-expanded={rules}>
            {rules ? 'Скрыть правило' : 'Освежить правило'}
          </Button>
        ) : null}
      </div>
      {rules ? (
        <div className="eg-rules">
          <Blocks blocks={blocks} />
        </div>
      ) : null}
    </section>
  );
}

function RunView({ run, dispatch }: { run: RunState; dispatch: (a: Action) => void }) {
  const sc = run.screen;
  return (
    <div className="eg eg-run">
      <StatusBar run={run} dispatch={dispatch} />
      {sc.kind === 'map' ? <LineMap run={run} dispatch={dispatch} /> : null}
      {sc.kind === 'fight' ? <FightView run={run} f={sc.fight} dispatch={dispatch} /> : null}
      {sc.kind === 'scene' ? <SceneView run={run} sc={sc} dispatch={dispatch} /> : null}
      {sc.kind === 'reward' ? <Reward sc={sc} dispatch={dispatch} /> : null}
      {sc.kind === 'shop' ? <Shop run={run} sc={sc} dispatch={dispatch} /> : null}
      {sc.kind === 'rest' ? <Rest run={run} dispatch={dispatch} /> : null}
      {sc.kind === 'find' ? <Find sc={sc} dispatch={dispatch} /> : null}
      {sc.kind === 'review' ? <Review sc={sc} dispatch={dispatch} /> : null}
      {sc.kind === 'bossIntro' ? <BossIntro run={run} dispatch={dispatch} /> : null}
    </div>
  );
}
