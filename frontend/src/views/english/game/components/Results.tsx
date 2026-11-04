'use client';

import { Button } from '@/shared/ui/Button';
import type { RunRow } from '../../api/hooks';
import { Say } from '../../components/Say';
import { EXERCISES } from '../../content';
import { fullSentence } from '../../model/sentence';
import { CHARACTERS, CHARACTER_IDS } from '../content/characters';
import type { QuestDef } from '../content/quests';
import { RELICS, RELIC_IDS } from '../content/relics';
import { SCENE_BY_ID } from '../content/scenes';
import { depthOf, type RunState } from '../model/engine';
import { maxFog, questProgress, unlocked } from '../model/meta';
import { MODES, type RunStats } from '../model/types';

const EXERCISE_BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

/** Итог забега (спека, «Итог забега»): игра коротко, учёба подробно. */
export function Results({
  run,
  before,
  quests,
  todayStats,
  onAgain,
  onHub,
}: {
  run: RunState;
  /** Забеги до этого — для рекорда и новых открытий. */
  before: readonly RunRow[];
  quests: QuestDef[];
  /** Статистика забегов дня вместе с этим. */
  todayStats: RunStats[];
  onAgain: () => void;
  onHub: () => void;
}) {
  const st = run.stats;
  const depth = depthOf(run);
  const best = Math.max(0, ...before.filter((r) => r.fog === run.fog).map((r) => r.score));
  const record = run.score > best && before.some((r) => r.fog === run.fog);
  const words = MODES.filter((m) => m !== 'order' && m !== 'dictate').reduce(
    (a, m) => ({ right: a.right + st.modes[m].right, wrong: a.wrong + st.modes[m].wrong }),
    { right: 0, wrong: 0 },
  );
  const mistakes = st.mistakes.map((id) => run.all.find((c) => c.id === id)).filter((c) => !!c);
  const after: RunRow[] = [
    { id: run.id, startedAt: '', finishedAt: '', character: run.character, fog: run.fog, outcome: run.outcome ?? 'quit', depth, score: run.score, stats: st },
    ...before,
  ];
  const was = unlocked(before);
  const opened = [...unlocked(after)].filter((id) => !was.has(id));
  const newRelics = RELIC_IDS.filter((id) => RELICS[id].unlock && opened.includes(RELICS[id].unlock!));
  const newChars = CHARACTER_IDS.filter((id) => CHARACTERS[id].unlock && opened.includes(CHARACTERS[id].unlock!));
  const fogUp = maxFog(after) > maxFog(before);

  const title =
    run.outcome === 'win' ? 'Хранитель повержен' : run.outcome === 'dead' ? `Туман взял своё · станция ${depth}` : 'Забег прерван';

  return (
    <section className="eg-results">
      <h2>{title}</h2>
      <p className="eg-score">
        {run.score} <span className="muted">очков</span>
        {record ? <b className="eg-record"> новый рекорд</b> : null}
      </p>

      <h3>Учёба</h3>
      <p>
        Слова: {words.right} верно из {words.right + words.wrong} · вспомнено {st.recalled} (интервал продлён) · новых {st.newWords}
        {st.recognized > 0 ? ` · узнано ${st.recognized} — без зачёта: чтобы засчитать, их надо вспомнить` : ''}
        {st.revenge > 0 ? ` · отбито ${st.revenge}` : ''}
      </p>
      {mistakes.length > 0 ? (
        <ul className="eg-list">
          {mistakes.map((c) => (
            <li key={c.id}>
              <span lang="en">{c.en}</span> <Say text={c.en} /> <span className="muted">{c.ru}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {st.boss.reached ? (
        <>
          <p>
            Хранитель: {st.boss.right} из {st.boss.right + st.boss.wrong} верно
          </p>
          {st.bossMistakes.length > 0 ? (
            <ul className="eg-list">
              {st.bossMistakes.map((id) => {
                const ex = EXERCISE_BY_ID.get(id);
                return ex ? (
                  <li key={id} lang="en">
                    {fullSentence(ex)}
                    {ex.ru || ex.type === 'translate' ? <span className="muted"> {ex.ru}</span> : null}
                  </li>
                ) : null;
              })}
            </ul>
          ) : null}
        </>
      ) : null}
      {st.scenes.length > 0 ? (
        <ul className="eg-list">
          {st.scenes.map((s, i) => (
            <li key={`${s.id}${i}`}>
              {SCENE_BY_ID.get(s.id)?.title ?? s.id} · уровень {s.level} · {'★'.repeat(s.stars)}
              {'☆'.repeat(3 - s.stars)}
            </li>
          ))}
        </ul>
      ) : null}

      <h3>Задания дня</h3>
      <ul className="eg-list">
        {quests.map((q) => {
          const n = Math.min(q.target, questProgress(q, todayStats));
          return (
            <li key={q.id} className={n >= q.target ? 'pos' : undefined}>
              {q.text} — {n} из {q.target}
            </li>
          );
        })}
      </ul>

      {newRelics.length > 0 || newChars.length > 0 || fogUp ? (
        <>
          <h3>Открылось</h3>
          <ul className="eg-list">
            {newChars.map((id) => (
              <li key={id}>
                Персонаж: <b>{CHARACTERS[id].name}</b> — {CHARACTERS[id].perk}
              </li>
            ))}
            {newRelics.map((id) => (
              <li key={id}>
                Находка: <b>{RELICS[id].name}</b> — {RELICS[id].text}
              </li>
            ))}
            {fogUp ? <li>Новый уровень тумана: {maxFog(after)}</li> : null}
          </ul>
        </>
      ) : null}

      <div className="eg-row">
        <Button variant="solid" autoFocus onClick={onAgain}>
          Ещё забег
        </Button>
        <Button variant="default" onClick={onHub}>
          К линиям
        </Button>
      </div>
    </section>
  );
}
