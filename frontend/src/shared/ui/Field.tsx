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

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'>, ControlProps {
  /**
   * Единица прямо в поле, у правого края — там, где подпись поля и так уже
   * названа («Депозит»), а слово в ней снова значило бы то же самое, что
   * стоит перед глазами при вводе.
   */
  suffix?: ReactNode;
  /**
   * Подпись поля прямо в нём, у левого края, — там, где отдельной строки-`Field`
   * над полем нет вовсе (поле само себя называет). `aria-label` в этом случае
   * ставит вызывающий: видимой подписи для скринридера больше нет.
   *
   * Не нативный `prefix` из `InputHTMLAttributes` (устаревший HTML-атрибут,
   * `string`) — здесь `ReactNode`, поэтому тип переопределён через `Omit`.
   */
  prefix?: ReactNode;
}

/**
 * Единственное поле ввода продукта: `.in` (+ `.full`) и ничего больше.
 * Тип, плейсхолдер и обработчики проходят насквозь — компонент отвечает только
 * за то, чтобы поле выглядело как поле, а не за то, что в нём вводят.
 *
 * С `suffix`/`prefix` оборачивается в `.in-adorned`: инпут остаётся тем же
 * `input` (ref смотрит на него, не на обёртку), а подпись и единица — соседние
 * `span`, поставленные поверх краёв абсолютным позиционированием.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { full, suffix, prefix, className, style, ...rest },
  ref,
) {
  if (suffix == null && prefix == null) {
    return <input ref={ref} className={cn('in', full && 'full', className)} style={style} {...rest} />;
  }
  return (
    <span className={cn('in-adorned', full && 'full')} style={style}>
      {prefix != null && <span className="in-prefix">{prefix}</span>}
      <input
        ref={ref}
        className={cn('in', prefix != null && 'in-has-prefix', suffix != null && 'in-has-suffix', className)}
        {...rest}
      />
      {suffix != null && <span className="in-suffix">{suffix}</span>}
    </span>
  );
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
  'data-tour': dataTour,
}: {
  label: ReactNode;
  /** Явный id контрола; без него берётся сгенерированный — см. render-проп. */
  htmlFor?: string;
  /** Готовый контрол либо функция, получающая id, который надо ему повесить. */
  children: ReactNode | ((id: string) => ReactNode);
  className?: string;
  style?: CSSProperties;
  /** Метка для обучения (features/onboarding) — см. тот же проп у `Wrap`. */
  'data-tour'?: string;
}) {
  const autoId = useId();
  const id = htmlFor ?? autoId;

  return (
    <div className={cn('field', className)} style={style} data-tour={dataTour}>
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
