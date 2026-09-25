'use client';

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
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
 *
 * Раскрытый список рисует CSS (`appearance: base-select` в globals.css), и
 * он — часть страницы, а не системное окно: Esc в нём видит и модальное окно
 * вокруг, и Radix закрыл бы окно целиком. Radix слушает document в фазе
 * перехвата, поэтому Esc из открытого списка останавливается раньше, на
 * window. Событие не отменяется — список браузер закрывает сам.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { full, className, children, ...rest },
  ref,
) {
  const inner = useRef<HTMLSelectElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLSelectElement);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = inner.current;
      if (e.key !== 'Escape' || !el || !(e.target instanceof Node) || !el.contains(e.target)) return;
      if (isPickerOpen(el)) e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <select ref={inner} className={cn('in', full && 'full', className)} {...rest}>
      {children}
    </select>
  );
});

/** `:open` у select понимают только браузеры со стилизуемым списком — у остальных он системный. */
function isPickerOpen(el: HTMLSelectElement) {
  try {
    return el.matches(':open');
  } catch {
    return false;
  }
}

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
