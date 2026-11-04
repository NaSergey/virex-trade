'use client';

import { Swords } from 'lucide-react';
import { cn } from '@/shared/lib/utils/css';
import type { Fight } from '../model/engine';

/**
 * Противник на сцене: существо из тумана, его здоровье и намерение. Всё, что
 * видно в бою, читается без слов: попал — существо вздрагивает и над ним
 * всплывает урон, промахнулся — оно бросается вперёд, точки под мечом — сколько
 * ходов до его удара. Движение — `transform`/`opacity` HTML-обёрток, внутри SVG
 * анимаций нет, кроме моргания глаз.
 */

const KIND_LABEL = {
  fight: 'Туман',
  elite: 'Элита',
  boss: 'Хранитель',
} as const;

function Sprite({ kind }: { kind: Fight['foe']['kind'] }) {
  return (
    <svg className="eg-sprite-svg" viewBox="0 0 160 130" aria-hidden>
      {kind === 'boss' ? <path className="eg-sprite-crown" d="M52 30 L60 8 L72 24 L80 4 L88 24 L100 8 L108 30 Z" /> : null}
      {kind === 'elite' ? (
        <>
          <path className="eg-sprite-horn" d="M46 40 Q34 18 40 4 Q52 22 60 32 Z" />
          <path className="eg-sprite-horn" d="M114 40 Q126 18 120 4 Q108 22 100 32 Z" />
        </>
      ) : null}
      <g className="eg-sprite-body">
        <circle cx="50" cy="70" r="30" />
        <circle cx="80" cy="54" r="38" />
        <circle cx="112" cy="72" r="28" />
        <rect x="34" y="70" width="94" height="36" rx="18" />
        <circle cx="46" cy="112" r="9" />
        <circle cx="80" cy="116" r="11" />
        <circle cx="114" cy="112" r="8" />
      </g>
      <g className="eg-sprite-eyes">
        <ellipse cx="66" cy="66" rx="8" ry="11" />
        <ellipse cx="96" cy="66" rx="8" ry="11" />
      </g>
      <path className="eg-sprite-mouth" d="M68 90 Q81 98 94 90" />
    </svg>
  );
}

function Intent({ f }: { f: Fight }) {
  const { foe } = f;
  const soon = foe.timer <= 1;
  const word = foe.timer === 1 ? 'ход' : foe.timer < 5 ? 'хода' : 'ходов';
  return (
    <div
      className={cn('eg-intent', soon && 'eg-intent-soon')}
      title={`Ударит на ${foe.atk} через ${foe.timer} ${word}. Ошибка — бьёт сразу.`}
      aria-label={`Ударит на ${foe.atk} через ${foe.timer} ${word}`}
    >
      <Swords size={14} aria-hidden />
      <b>{foe.atk}</b>
      <span className="eg-pips">
        {Array.from({ length: Math.max(foe.every, foe.timer) }, (_, i) => (
          <i key={i} className={cn(i < foe.timer && 'on')} />
        ))}
      </span>
    </div>
  );
}

export function FoeStage({ f }: { f: Fight }) {
  const { foe } = f;
  const last = f.phase === 'result' ? f.last : null;
  const hit = !!last && last.damage > 0;
  const struck = !!last && last.taken > 0;
  const dead = foe.hp <= 0;
  const ratio = foe.hp / foe.maxHp;
  return (
    <div
      className={cn(
        'eg-stage',
        `eg-kind-${foe.kind}`,
        `eg-foe-${foe.id}`,
        (f.phase === 'answer' || f.phase === 'result') && 'eg-stage-compact',
        dead && 'eg-stage-dead',
      )}
    >
      <div className="eg-stage-top">
        <p className="eg-foe-name">
          <span>{KIND_LABEL[foe.kind]}</span>
          <b>{foe.name}</b>
        </p>
        {!dead ? <Intent f={f} /> : null}
      </div>
      {foe.text ? <p className="eg-foe-rule">{foe.text}</p> : null}

      <div className="eg-sprite-zone">
        <div className="eg-sprite-float" style={{ scale: String(0.7 + 0.3 * ratio) }}>
          <div
            key={last ? `${f.shownAt}:${foe.hp}` : 'idle'}
            className={cn('eg-sprite', hit && 'eg-sprite-hit', struck && !hit && 'eg-sprite-lunge', dead && 'eg-sprite-die')}
          >
            <Sprite kind={foe.kind} />
          </div>
        </div>
        {last ? (
          <div key={`n${f.shownAt}:${foe.hp}`} className="eg-floats" aria-live="polite">
            {hit ? (
              <span className={cn('eg-float', last.crit && 'eg-float-crit')}>
                {last.crit ? 'КРИТ ' : ''}−{last.damage}
              </span>
            ) : last.outcome === 'wrong' ? (
              <span className="eg-float eg-float-miss">мимо</span>
            ) : null}
            {struck ? <span className="eg-float eg-float-hurt">♥ −{last.taken}</span> : null}
            {last.healed > 0 ? <span className="eg-float eg-float-heal">♥ +{last.healed}</span> : null}
          </div>
        ) : null}
      </div>

      <div className="eg-foe-hp" aria-label={`Здоровье противника ${foe.hp} из ${foe.maxHp}`}>
        <i style={{ transform: `scaleX(${ratio})` }} />
        <span>
          {foe.hp} / {foe.maxHp}
        </span>
      </div>
    </div>
  );
}
