import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils/css';

/**
 * Шапка секции главной — одна на все: раздел капителью под линейкой, под ним
 * заголовок и лид — там, где секции есть что сказать словами (у терминала и
 * пяти пунктов говорит содержимое, шапка — только раздел). Секции читаются
 * одной страницей, только если каждая начинается одинаково и в одном месте:
 * шапка встаёт сразу под меню, когда секция доезжает до верха. Проявляется
 * шапка вместе с переходом своей секции — у каждой он свой.
 *
 * На широком экране заголовок слева, лид справа по нижнему краю; `stack` —
 * в одну колонку, для секции, где справа стоит своё (форма регистрации).
 */
export function SceneHead({
  kicker,
  kickerId,
  title,
  lede,
  titleId,
  stack,
  children,
}: {
  kicker: string;
  kickerId?: string;
  title?: string;
  lede?: string;
  titleId?: string;
  stack?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className={cn('ls-head', stack && 'ls-head-stack')}>
      <h2 className="ls-kicker" id={kickerId}>
        {kicker}
      </h2>
      {title && (
        <p className="ls-head-title" id={titleId}>
          {title}
        </p>
      )}
      {lede && <p className="lp-lede">{lede}</p>}
      {children}
    </header>
  );
}
