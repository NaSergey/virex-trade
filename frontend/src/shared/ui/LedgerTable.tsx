'use client';

import { Fragment, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/shared/ui/Skeleton';

/** Описание одной колонки журнала. */
export interface LedgerColumn<T> {
  /** Стабильный ключ колонки. */
  key: string;
  /** Подпись в шапке; без неё колонка остаётся безымянной (каретка, действия). */
  header?: ReactNode;
  /**
   * Подпись строки в мобильной раскладке, где таблица превращается в записи.
   * По умолчанию берётся из header, если он текст.
   */
  label?: string;
  /** Числовые колонки выравниваются вправо — разряды должны стоять под разрядами. */
  align?: 'left' | 'right';
  /** Ширина колонки в пикселях, когда содержимому нужна своя мерка. */
  width?: number;
  /** Класс ячейки: 'n' — моноширинные цифры, 'cell-tags' — перенос тегов. */
  cellClassName?: string;
  /** Ключ сортировки. Есть — заголовок становится кликабельным. */
  sortKey?: string;
  /**
   * Колонка не рисует заглушку при загрузке. Ставится там, где ячейка несёт не
   * значение, а действие (звезда закрепа, крестик удаления): полоса краски на
   * этом месте обещает число, которое никогда не придёт, — а кнопка появится
   * сама, когда появится строка.
   */
  noSkeleton?: boolean;
  render: (row: T) => ReactNode;
}

/**
 * Ряды ширин заглушек в процентах от ячейки — свой для текста и свой для чисел.
 *
 * Ряд один на всю таблицу был ошибкой: в колонке «Сделок» стоит «14», а
 * заглушка занимала под него 88 % ячейки — обещание длинного значения там, где
 * придут два знака. Числа короткие и прижаты вправо, слова длинные и идут
 * влево, и заглушка обязана врать не больше, чем на пару символов.
 *
 * Семь значений в каждом ряду — простое число: при любом числе колонок узор не
 * ложится столбиками.
 */
const SKEL_TEXT = [76, 58, 88, 64, 82, 52, 70];
const SKEL_NUM = [42, 56, 34, 48, 38, 60, 44];

export interface LedgerSort {
  key: string;
  /** −1 — по убыванию (первым идёт большее), 1 — по возрастанию. */
  dir: 1 | -1;
}

interface LedgerTableProps<T> {
  columns: LedgerColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Минимальная ширина, ниже которой таблица уезжает в горизонтальную прокрутку. */
  minWidth?: number;
  isLoading?: boolean;
  /**
   * Сколько строк-заглушек рисовать при загрузке. По умолчанию пять; страница
   * с известным размером листа передаёт его, и тогда таблица занимает ровно ту
   * высоту, которую займут пришедшие строки.
   */
  skeletonRows?: number;
  /** Что показать вместо строк, когда их нет. */
  empty?: ReactNode;
  sort?: LedgerSort;
  onSort?: (key: string) => void;
  /**
   * Содержимое раскрытой строки. Передано — строки становятся раскрывающимися,
   * слева появляется каретка, а состояние раскрытия живёт внутри таблицы:
   * наружу оно никому не нужно.
   *
   * Функцией, а не готовым узлом: свёрнутая строка не должна рендерить ничего,
   * иначе каждая строка сразу дёрнет свой запрос за данными раскрытия.
   */
  renderExpanded?: (row: T) => ReactNode;
  /**
   * Адрес, куда ведёт строка. Есть — вся строка становится переходом: курсор,
   * та же подсветка по наведению, что у раскрывающихся строк, и Enter с
   * клавиатуры.
   *
   * Клики по ссылкам и кнопкам внутри строки переходом НЕ считаются: в строке
   * живут свои действия (закреп, «скрыть», удаление), и промах по кнопке не
   * должен уводить со страницы.
   *
   * С `renderExpanded` не сочетается — клик по строке может значить либо
   * раскрытие, либо переход, но не оба сразу.
   */
  rowHref?: (row: T) => string | undefined;
}

/**
 * Таблица-журнал: одна разметка на все страницы.
 *
 * Пять таблиц продукта (позиции, закрытые сделки, комбинации, теги, подходящие
 * сделки «Выборки») отличаются только колонками — но каждая ещё обязана нести
 * `data-l` на ячейках (на узком экране таблица превращается в записи и подписи
 * берутся оттуда), одинаково выравнивать числа и одинаково раскрываться. Пока
 * это было пять раз написано вручную, любая из этих договорённостей могла
 * разойтись в одной таблице и остаться в остальных.
 *
 * Колонки описываются данными, а не разметкой: заголовок, выравнивание,
 * мобильная подпись и ячейка объявлены в одном месте, поэтому забыть подпись
 * или выровнять цифры влево уже негде.
 */
export function LedgerTable<T>({
  columns,
  rows,
  rowKey,
  minWidth,
  isLoading,
  skeletonRows = 5,
  empty,
  sort,
  onSort,
  renderExpanded,
  rowHref,
}: LedgerTableProps<T>) {
  const router = useRouter();
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Строка, которая доигрывает анимацию закрытия. React убирал бы её из DOM
  // мгновенно вместе с сеткой ордеров — раскрытие проигрывалось, а закрытие
  // просто исчезало рывком. Держим узел смонтированным до конца .closing.
  const [closingKey, setClosingKey] = useState<string | null>(null);

  const caret: LedgerColumn<T> = {
    key: '__caret',
    width: 22,
    cellClassName: 'caret-cell',
    // Глиф один и тот же — открытое состояние поворачивает его CSS-transition'ом
    // (tr.row.open .caret), а не подменой символа, иначе раскрытие дёргалось бы.
    render: () => <span className="caret">▸</span>,
  };
  const cols = renderExpanded ? [caret, ...columns] : columns;

  const cellClass = (c: LedgerColumn<T>) =>
    [c.align === 'right' ? 'r' : null, c.cellClassName].filter(Boolean).join(' ') || undefined;

  const labelOf = (c: LedgerColumn<T>) => c.label ?? (typeof c.header === 'string' ? c.header : '');

  /**
   * Ширина заглушки в ячейке. Не случайная — иначе полосы пересобираются на
   * каждом рендере и таблица шевелится, — а снятая с постоянного ряда по
   * номеру строки и колонки: соседние ячейки выходят разной длины, и блок
   * читается как текст, а не как сетка одинаковых плашек.
   */
  const skelWidth = (row: number, col: number, numeric: boolean) => {
    const ring = numeric ? SKEL_NUM : SKEL_TEXT;
    return ring[(row * 3 + col * 2) % ring.length];
  };

  return (
    <div className="scroll">
      {/* Мерка идёт переменной, а не свойством min-width: инлайновый стиль
          сильнее любого правила таблицы стилей, и на узком экране, где .ledger
          рассыпается в карточки и min-width снимается, объявленные здесь 980px
          пережили бы это снятие. */}
      <table
        className="ledger"
        style={minWidth ? ({ '--ledger-min': `${minWidth}px` } as React.CSSProperties) : undefined}
      >
        <thead>
          <tr>
            {cols.map((c) => {
              const sorted = c.sortKey != null && sort?.key === c.sortKey;
              return (
                <th
                  key={c.key}
                  className={[c.align === 'right' ? 'r' : null, c.sortKey ? 'sortable' : null]
                    .filter(Boolean)
                    .join(' ')}
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={sorted ? (sort!.dir < 0 ? 'descending' : 'ascending') : undefined}
                  onClick={c.sortKey && onSort ? () => onSort(c.sortKey!) : undefined}
                >
                  {c.header}
                  {/* Стрелка только у той колонки, по которой сортируют: указатель
                      на каждом заголовке ничего не сообщает. */}
                  {sorted ? (sort!.dir < 0 ? ' ↓' : ' ↑') : ''}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            // Строки-заглушки по числу колонок, а не одна полоса на всю
            // ширину: журнал грузится в свою же разметку — те же колонки, те
            // же линейки, та же высота строки, — поэтому приход данных ничего
            // не двигает. На узком экране таблица рассыпается в записи по
            // `data-l`, и заглушкам подписи нужны ровно так же, как строкам.
            Array.from({ length: skeletonRows }, (_, r) => (
              <tr key={`skel-${r}`} aria-hidden>
                {cols.map((c, i) => (
                  <td key={c.key} data-l={labelOf(c)} className={cellClass(c)}>
                    {c.key === '__caret' || c.noSkeleton ? null : (
                      <Skeleton
                        as="span"
                        flush
                        // 11px — рост строчной цифры этого набора: заглушка
                        // занимает столько же места по вертикали, сколько
                        // займёт число, и строка не садится при подстановке.
                        height={11}
                        width={`${skelWidth(r, i, c.align === 'right')}%`}
                        className={c.align === 'right' ? 'skel-r' : undefined}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={cols.length} data-l="" className="muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => {
              const key = rowKey(row);
              const open = openKey === key;
              const closing = !open && closingKey === key;
              const href = rowHref?.(row);
              // Собственные действия строки остаются собственными: клик,
              // пришедший из ссылки или кнопки внутри неё, переходом не считаем.
              const fromControl = (e: React.MouseEvent) =>
                (e.target as HTMLElement).closest('a,button,input,select,textarea') != null;
              const go = () => router.push(href!);
              const toggle = () => {
                if (open) {
                  // закрываем — прежняя строка доигрывает анимацию, а не пропадает
                  setClosingKey(key);
                  setOpenKey(null);
                } else {
                  // переключение на другую строку тоже должно увести прежнюю с анимацией
                  if (openKey) setClosingKey(openKey);
                  setOpenKey(key);
                }
              };
              return (
                <Fragment key={key}>
                  <tr
                    className={renderExpanded || href ? `row${open ? ' open' : ''}` : undefined}
                    style={{ '--i': index } as React.CSSProperties}
                    tabIndex={href ? 0 : undefined}
                    onClick={
                      href
                        ? (e) => {
                            if (!fromControl(e)) go();
                          }
                        : renderExpanded
                          ? toggle
                          : undefined
                    }
                    onKeyDown={
                      href
                        ? (e) => {
                            if (e.target !== e.currentTarget) return;
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              go();
                            }
                          }
                        : undefined
                    }
                  >
                    {cols.map((c) => (
                      <td key={c.key} data-l={labelOf(c)} className={cellClass(c)}>
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                  {(open || closing) && renderExpanded && (
                    <tr className="exp">
                      <td colSpan={cols.length}>
                        <div
                          className={`row-reveal${closing ? ' closing' : ''}`}
                          onAnimationEnd={() => setClosingKey((k) => (k === key ? null : k))}
                        >
                          {renderExpanded(row)}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
