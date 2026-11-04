'use client';

import { useState } from 'react';
import { ICONS, type IconId } from '../icons';
import { spendMorale, type HoldState } from '../model/rules';
import { saveGame } from '../model/store';
import { Tap } from './Words';
import { answerVisitor, type Answer, type VisitorKind } from '../model/visitors';

/**
 * Гость у ворот (шаг 4): ночные ворота с факелами, силуэт гостя, его слова на пергаменте и одна
 * деталь со стены. Ответ — фразой-кнопкой; после ответа — что случилось и «Continue».
 */

const ICON: Record<VisitorKind, IconId> = { trader: 'rider', liar: 'rider', beggar: 'hood', traveler: 'hood' };
const TITLE: Record<VisitorKind, string> = {
  trader: 'A stranger at the gate',
  liar: 'A stranger at the gate',
  beggar: 'People at the gate',
  traveler: 'A wounded man at the gate',
};

function Ico({
  id,
  x,
  y,
  s,
  fill,
  className,
}: {
  id: IconId;
  x: number;
  y: number;
  s: number;
  fill: string;
  className?: string;
}) {
  return (
    <svg x={x - s / 2} y={y - s / 2} width={s} height={s} viewBox="0 0 512 512" className={className}>
      <path d={ICONS[id]} fill={fill} />
    </svg>
  );
}

function GateScene({ kind }: { kind: VisitorKind }) {
  const W = 390;
  const H = 250;
  return (
    <svg className="ah-scene ah-gate-scene" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width={W} height={H} fill="#0b0808" />
      <rect width={W} height={H * 0.7} fill="#1c1410" />
      <circle cx="310" cy="56" r="26" fill="#c9c0a8" opacity=".85" />
      <circle cx="310" cy="56" r="70" fill="#c9c0a8" opacity=".06" />
      {Array.from({ length: 22 }, (_, i) => {
        const x = i * 18;
        if (x > 120 && x < 268) return null;
        return (
          <path key={i} d={`M${x} ${H - 30} V${110 + ((x * 7) % 26)} l9 -14 l9 14 V${H - 30}z`} fill="#2e2318" stroke="#0a0705" />
        );
      })}
      <rect x="112" y="78" width="16" height={H - 108} fill="#3a2c1e" stroke="#0a0705" />
      <rect x="262" y="78" width="16" height={H - 108} fill="#3a2c1e" stroke="#0a0705" />
      <rect x="104" y="70" width="182" height="14" fill="#3a2c1e" stroke="#0a0705" />
      <circle cx="120" cy="62" r="54" fill="url(#ah-light)" className="ah-glow" />
      <circle cx="270" cy="62" r="54" fill="url(#ah-light)" className="ah-glow" />
      <Ico id="torch" x={120} y={60} s={26} fill="#e8913c" className="ah-flame" />
      <Ico id="torch" x={270} y={60} s={26} fill="#e8913c" className="ah-flame" />
      <ellipse cx="195" cy={H - 30} rx="80" ry="7" fill="#000" opacity=".7" />
      <Ico
        id={ICON[kind]}
        x={195}
        y={H - 92}
        s={kind === 'trader' || kind === 'liar' ? 140 : 120}
        fill="#0a0807"
        className="ah-visitor"
      />
      <rect y={H - 30} width={W} height="30" fill="#080605" />
      <rect width={W} height={H} fill="url(#ah-vig)" />
    </svg>
  );
}

export function GateView({ s }: { s: HoldState }) {
  const v = s.visitor!;
  const [result, setResult] = useState<{ state: HoldState; lines: string[] } | null>(null);
  const [ru, setRu] = useState(false);
  const pick = (a: Answer) => setResult(answerVisitor(s, a));
  return (
    <div className="ah-sheet-back ah-gate-back">
      <div className="ah-gate" role="dialog" aria-label={TITLE[v.kind]}>
        <div className="ah-banner">{TITLE[v.kind].toUpperCase()}</div>
        <GateScene kind={v.kind} />
        <div className="ah-gate-say">
          <small>
            <Tap text={v.kind === 'beggar' ? 'THE WOMAN SAYS' : 'THE STRANGER SAYS'} />
          </small>
          “<Tap text={v.speech} />”{ru && v.ru ? <span className="ah-ru">{v.ru.speech}</span> : null}
        </div>
        <p className="ah-gate-detail">
          <Tap text={v.detail} />
          {ru && v.ru ? <span className="ah-ru">{v.ru.detail}</span> : null}
        </p>
        {!result && !ru && v.ru ? (
          <button
            type="button"
            className="ah-translate"
            onClick={() => {
              saveGame(spendMorale(s));
              setRu(true);
            }}
          >
            Translate · −1 morale
          </button>
        ) : null}
        {result ? (
          <>
            <ul className="ah-gate-result">
              {result.lines.map((l, i) => (
                <li key={i}>
                  <Tap text={l} />
                </li>
              ))}
            </ul>
            <button type="button" className="ah-btn" onClick={() => saveGame(result.state)}>
              Continue
            </button>
          </>
        ) : (
          <div className="ah-gate-answers">
            <p className="ah-lab">
              <Tap text="Your answer" />
            </p>
            {v.options.map((o) => (
              <button key={o.id} type="button" className="ah-gate-answer ah-frame" onClick={() => pick(o.id)}>
                {o.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
