'use client';

import Link from 'next/link';
import { Button } from '@/shared/ui/Button';
import { PageHead } from '@/shared/ui/PageHead';
import { Seg } from '@/shared/ui/Seg';
import { cn } from '@/shared/lib/utils/css';
import { dateFormat } from '@/shared/lib/utils/intl';
import type { RunRow } from '../../api/hooks';
import { SECTION_BY_ID } from '../../content';
import { Summary } from '../../components/today/Summary';
import { plural } from '../../model/today';
import { CHARACTERS, CHARACTER_IDS, type CharacterId } from '../content/characters';
import type { QuestDef } from '../content/quests';
import { RELICS, RELIC_IDS, UNLOCK_TEXT } from '../content/relics';
import { SCENES } from '../content/scenes';
import { WEATHER } from '../content/weather';
import { questProgress, records, type Records } from '../model/meta';
import type { SceneLevel } from '../model/scene';
import type { RunStats, WeatherId } from '../model/types';

export interface HubProps {
  runs: RunRow[];
  fog: number;
  newLeft: number;
  weather: WeatherId;
  quests: QuestDef[];
  todayStats: RunStats[];
  streak: number;
  strip: ('none' | 'played' | 'gold')[];
  characters: CharacterId[];
  character: CharacterId;
  onCharacter: (c: CharacterId) => void;
  maxFog: number;
  fogLevel: number;
  onFog: (n: number) => void;
  open: ReadonlySet<string>;
  levels: ReadonlyMap<string, SceneLevel>;
  unlocked: ReadonlySet<string>;
  /** Отвечать голосом; null — микрофона в браузере нет, выбора тоже. */
  voice: { on: boolean; set: (on: boolean) => void } | null;
  onStart: () => void;
}

const OUTCOME: Record<RunRow['outcome'], string> = { win: 'хранитель повержен', dead: 'туман взял своё', quit: 'сдался' };

function RecordsView({ r }: { r: Records }) {
  return (
    <Summary
      items={[
        { label: 'Лучшие очки', value: String(Math.max(0, ...r.best.values())) },
        { label: 'Дальше всего', value: r.depth >= 10 ? 'вся линия' : `станция ${r.depth}` },
        { label: 'Хранителей', value: String(r.wins) },
        { label: 'Лучшая серия', value: String(r.combo) },
      ]}
    />
  );
}

export function Hub(p: HubProps) {
  const rec = records(p.runs);
  const fmt = dateFormat('ru', { day: 'numeric', month: 'short' });
  return (
    <>
      <Link href="/english/hold" className="eg-other">
        <b>Ashen Hold</b>
        <span>вторая игра · выживание отряда, приказы по-английски</span>
      </Link>
      <PageHead
        title="Mind the Gap"
        lede={
          p.runs.length === 0
            ? 'Над Лондоном туман, и он съедает слова. Спускайся в подземку: в бою отбивай слова у тумана, на станциях договаривайся с лондонцами. В конце линии — хранитель, который держит туман грамматикой.'
            : `Забегов ${rec.runs} · ${p.streak > 0 ? `${p.streak} ${plural(p.streak, ['день', 'дня', 'дней'])} подряд` : 'серия начнётся с забега'}`
        }
      />

      <div className="eg-hub-main">
        <p className="eg-fogline">
          {p.fog > 0
            ? `Туман: ${p.fog} ${plural(p.fog, ['слово ждёт', 'слова ждут', 'слов ждут'])} повторения`
            : `Туман рассеян · новых слов на сегодня: ${p.newLeft}`}
        </p>
        <Button variant="solid" className="eg-start" onClick={p.onStart}>
          Начать забег
        </Button>
        <p className="muted">
          Погода дня — {WEATHER[p.weather].name.toLowerCase()}: {WEATHER[p.weather].text}.
        </p>
        {p.voice ? (
          <Seg
            ariaLabel="Ответы голосом"
            options={[
              { value: 'on', label: 'С голосом', title: 'Удар «Сказать» и ответы в сценах — вслух' },
              { value: 'off', label: 'Без голоса', title: 'Всё пишешь и выбираешь — говорить вслух не нужно' },
            ]}
            value={p.voice.on ? 'on' : 'off'}
            onChange={(v) => p.voice!.set(v === 'on')}
          />
        ) : null}
        {p.characters.length > 1 ? (
          <Seg
            ariaLabel="Персонаж"
            options={p.characters.map((c) => ({ value: c, label: CHARACTERS[c].name, title: CHARACTERS[c].perk }))}
            value={p.character}
            onChange={p.onCharacter}
          />
        ) : null}
        {p.maxFog > 0 ? (
          <Seg
            ariaLabel="Уровень тумана"
            options={Array.from({ length: p.maxFog + 1 }, (_, i) => ({ value: i, label: `туман ${i}` }))}
            value={p.fogLevel}
            onChange={p.onFog}
          />
        ) : null}
      </div>

      <section className="en-section">
        <h3>Задания дня</h3>
        <ul className="eg-quests">
          {p.quests.map((q) => {
            const n = Math.min(q.target, questProgress(q, p.todayStats));
            return (
              <li key={q.id} className={cn(n >= q.target && 'eg-quest-done')}>
                <span>{q.text}</span>
                <span className="eg-quest-n">
                  {n} / {q.target}
                </span>
                <div className="eg-bar">
                  <i style={{ transform: `scaleX(${n / q.target})` }} />
                </div>
              </li>
            );
          })}
        </ul>
        <div className="eg-strip" aria-label="Последние 14 дней: сыгранные и золотые">
          {p.strip.map((d, i) => (
            <i key={i} className={`eg-day-${d}`} title={d === 'gold' ? 'все три задания' : d === 'played' ? 'был забег' : ''} />
          ))}
        </div>
      </section>

      {p.runs.length > 0 ? (
        <section className="en-section">
          <h3>Рекорды</h3>
          <RecordsView r={rec} />
        </section>
      ) : null}

      <section className="en-section eg-collection">
        <h3>Коллекция</h3>
        <details>
          <summary>
            Находки · {RELIC_IDS.filter((id) => !RELICS[id].unlock || p.unlocked.has(RELICS[id].unlock!)).length} из{' '}
            {RELIC_IDS.length}
          </summary>
          <ul className="eg-list">
            {RELIC_IDS.map((id) => {
              const r = RELICS[id];
              const open = !r.unlock || p.unlocked.has(r.unlock);
              return (
                <li key={id} className={cn(!open && 'muted')}>
                  <b>{r.name}</b> — {open ? r.text : `откроется: ${UNLOCK_TEXT[r.unlock!]}`}
                </li>
              );
            })}
          </ul>
        </details>
        <details>
          <summary>Персонажи · {p.characters.length} из {CHARACTER_IDS.length}</summary>
          <ul className="eg-list">
            {CHARACTER_IDS.map((id) => {
              const c = CHARACTERS[id];
              const open = p.characters.includes(id);
              return (
                <li key={id} className={cn(!open && 'muted')}>
                  <b>{c.name}</b> · ♥ {c.hp} · {RELICS[c.relic].name} · {c.perk}
                  {!open && c.unlock ? ` — откроется: ${UNLOCK_TEXT[c.unlock]}` : ''}
                </li>
              );
            })}
          </ul>
        </details>
        <details>
          <summary>
            Сцены · открыто {SCENES.filter((s) => p.open.has(s.unit)).length} из {SCENES.length}
          </summary>
          <ul className="eg-list">
            {SCENES.map((s) => {
              const open = p.open.has(s.unit);
              const lv = p.levels.get(s.id);
              const best = lv ? Math.max(...lv.best) : 0;
              return (
                <li key={s.id} className={cn(!open && 'muted')}>
                  <b>{s.title}</b>
                  {open
                    ? ` · уровень ${lv?.level ?? 1} · ${'★'.repeat(best)}${'☆'.repeat(3 - best)}`
                    : ` — откроется с ${SECTION_BY_ID.get(s.unit)?.title ?? s.unit}`}
                </li>
              );
            })}
          </ul>
        </details>
      </section>

      {p.runs.length > 0 ? (
        <section className="en-section">
          <h3>Последние забеги</h3>
          <ul className="eg-list">
            {p.runs.slice(0, 5).map((r) => (
              <li key={r.id}>
                {fmt.format(new Date(r.finishedAt))} · {CHARACTERS[r.character as CharacterId]?.name ?? r.character} ·{' '}
                {OUTCOME[r.outcome]}
                {r.outcome !== 'win' ? `, станция ${r.depth}` : ''} · {r.score} очков
                {r.fog > 0 ? ` · туман ${r.fog}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
