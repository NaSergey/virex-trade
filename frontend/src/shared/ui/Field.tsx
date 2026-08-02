'use client';

import {
  forwardRef,
  useId,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { cn } from '@/shared/lib/utils/css';

interface ControlProps {
  /** Растянуть на всю ширину родителя (`.in.full`) — поля форм и диалогов. */
  full?: boolean;
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, ControlProps {}

/**
 * Единственное поле ввода продукта: `.in` (+ `.full`) и ничего больше.
 * Тип, плейсхолдер и обработчики проходят насквозь — компонент отвечает только
 * за то, чтобы поле выглядело как поле, а не за то, что в нём вводят.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { full, className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn('in', full && 'full', className)} {...rest} />;
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, ControlProps {}

/**
 * Выпадающий список в той же оправе, что и `Input`. Варианты передаются
 * детьми (`<option>`), а не массивом: списки здесь разнородные — где-то часы,
 * где-то категории тегов, где-то первым идёт пустой пункт-заглушка, — и
 * пересказывать всё это пропсами вышло бы длиннее самой разметки.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { full, className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn('in', full && 'full', className)} {...rest}>
      {children}
    </select>
  );
});

/**
 * Подписанное поле: `.field` + `.lbl` + контрол, связанные общим id.
 *
 * Связка label↔control — та часть, которую проще всего забыть и невозможно
 * заметить глазами: без неё клик по подписи не ставит курсор в поле, а
 * скринридер читает поле безымянным. Здесь id генерируется сам (useId), если
 * его не задали, поэтому забыть htmlFor уже негде.
 */
export function Field({
  label,
  htmlFor,
  children,
  className,
  style,
}: {
  label: ReactNode;
  /** Явный id контрола; без него берётся сгенерированный — см. render-проп. */
  htmlFor?: string;
  /** Готовый контрол либо функция, получающая id, который надо ему повесить. */
  children: ReactNode | ((id: string) => ReactNode);
  className?: string;
  style?: CSSProperties;
}) {
  const autoId = useId();
  const id = htmlFor ?? autoId;

  return (
    <div className={cn('field', className)} style={style}>
      <label className="lbl" htmlFor={id}>
        {label}
      </label>
      {typeof children === 'function' ? children(id) : children}
    </div>
  );
}

/**
 * Подписанная группа контролов, у которой нет одного поля: тумблер категорий,
 * ряд тегов на выбор.
 *
 * Отдельно от `Field` именно из-за подписи: `<label htmlFor>` обязан указывать
 * на один контрол, а здесь их несколько, и указывать не на что. Поэтому подпись
 * тут — `span`, а не `label`; выглядит она так же (`.lbl` в `.field`), но
 * ничего не обещает скринридеру.
 */
export function FieldGroup({
  label,
  children,
  className,
  style,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={cn('field', className)} style={style}>
      <span className="lbl">{label}</span>
      {children}
    </div>
  );
}
