'use client';

import { useTranslations } from 'next-intl';
import { Wrap } from '@/shared/ui/Wrap';
import { SceneHead } from './SceneHead';
import { TerminalDemo } from './TerminalDemo';

/**
 * «Терминал» — шапка и сам терминал продукта на демо-счёте: в нём можно
 * открыть позицию, а наведение на любую часть объясняет, что она делает.
 * В шапке — только раздел: заголовок и лид над терминалом сняты владельцем,
 * говорит сам экран.
 *
 * Перехода на въезде у секции нет: «включение экрана» (луч, раскрытие
 * обрезкой) стояло и снято владельцем 2026-10-13.
 */
export function TerminalScene() {
  const t = useTranslations('landing.term');

  return (
    <section className="ls-term" id="terminal" aria-labelledby="terminal-title">
      <div className="ls-term-in">
        <Wrap>
          <SceneHead kicker={t('kicker')} kickerId="terminal-title" />
        </Wrap>
        <TerminalDemo />
      </div>
    </section>
  );
}
