'use client';

import { Fragment } from 'react';

/**
 * Заголовок, разобранный на слова: каждое слово лежит в собственной
 * «прорези» с `overflow: hidden`, и появление — это подъём слова из-под её
 * нижнего края.
 *
 * По словам, а не по строкам: строк на разной ширине экрана разное число, и
 * любое их предвычисление на клиенте означает измерение после гидратации,
 * то есть кадр с уже видимым, ещё не анимированным заголовком.
 *
 * Пробел стоит между прорезями, а не внутри: у `inline-block` хвостовой
 * пробел схлопывается, и слова слипались бы в одно.
 */
export function SplitWords({ text }: { text: string }) {
  const words = text.split(' ');
  return (
    <>
      {words.map((word, i) => (
        <Fragment key={`${word}-${i}`}>
          <span className="ls-word">
            <span className="ls-word-in">{word}</span>
          </span>
          {i < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </>
  );
}
