'use client';

import { SectionHead } from '@/shared/ui/SectionHead';
import { clock } from '../model/format';
import { STEPS, VIDEO_1 } from '../model/rules';

/** Алгоритм автора шагами: как в видео и как правило понимает машина. */
export function RulesSection() {
  return (
    <section id="rules" className="st-section">
      <SectionHead title="Стратегия" />
      <p className="muted">
        «Интрадей стратегия с нуля» SanchoDT — для лонга, шорт зеркально. Слева — как в видео, справа — как правило
        считает система.
      </p>
      <ol className="st-steps">
        {STEPS.map((s) => (
          <li key={s.title}>
            <h3>
              {s.title}
              {s.at != null && (
                <a className="st-at" href={`${VIDEO_1}&t=${s.at}s`} target="_blank" rel="noreferrer">
                  {clock(s.at)}
                </a>
              )}
            </h3>
            <div className="st-step-cols">
              <p>
                <span className="lbl">В видео</span>
                {s.video}
              </p>
              <p>
                <span className="lbl">Система</span>
                {s.system}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
