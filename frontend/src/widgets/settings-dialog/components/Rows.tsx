import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils/css';

/**
 * Раздел окна: заголовок капсом с линейкой под ним и строки — как разделы
 * настроек Доты («ДЕЙСТВИЯ ЮНИТОВ», «ЧАТ»). `risk` красит линейку в цвет
 * убытка — у отключения биржи.
 */
export function Section({
  title,
  aside,
  risk,
  className,
  children,
}: {
  title: ReactNode;
  /** Короткое число справа от заголовка (сколько сигналов включено). */
  aside?: ReactNode;
  risk?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('stg-sec', risk && 'is-risk', className)}>
      <h4 className="stg-h">
        {title}
        {aside != null && <b>{aside}</b>}
      </h4>
      {children}
    </section>
  );
}

/**
 * Строка «подпись | значение» двумя плашками в одну линию. Подпись и поле не
 * встают друг под другом: «Пароль», а под ним «Текущий» читались двумя
 * строками одного смысла (владелец 2026-10-17).
 */
export function Row({
  label,
  htmlFor,
  className,
  children,
}: {
  label: ReactNode;
  /** id поля в значении — подпись тогда `<label>` и ставит в него фокус. */
  htmlFor?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn('stg-row', className)}>
      {htmlFor ? (
        <label className="stg-k" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="stg-k">{label}</span>
      )}
      <div className="stg-v">{children}</div>
    </div>
  );
}

/** Строка подсказки под строками раздела. */
export function Hint({ error, children }: { error?: boolean; children: ReactNode }) {
  return <p className={cn('stg-hint', error && 'neg')}>{children}</p>;
}
