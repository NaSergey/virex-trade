'use client';

import { cn } from '@/shared/lib/utils/css';
import { alignScore, type WordMark } from '../model/align';

const TITLE: Record<WordMark['kind'], string> = { ok: 'верно', missing: 'пропущено', extra: 'лишнее' };

/** Разметка фразы по словам: верные, пропущенные, лишние — и доля верных. */
export function Marks({ marks }: { marks: readonly WordMark[] }) {
  return (
    <p className="en-marks" lang="en">
      {marks.map((m, i) => (
        <span key={i} title={TITLE[m.kind]} className={cn(`en-mark-${m.kind}`, m.kind === 'ok' ? 'pos' : 'neg')}>
          {m.word}
        </span>
      ))}
      <span className="en-marks-score muted">{Math.round(alignScore(marks) * 100)} %</span>
    </p>
  );
}
