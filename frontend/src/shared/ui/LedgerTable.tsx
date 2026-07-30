'use client';

import { Fragment, useState, type ReactNode } from 'react';

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
  render: (row: T) => ReactNode;
}

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
}

/**
 * Таблица-журнал: одна разметка на все страницы.
 *
 * Пять таблиц продукта (позиции, закрытые сделки, комбинации, теги, выборка
 * Лаборатории) отличаются только колонками — но каждая ещё обязана нести
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
  empty,
  sort,
  onSort,
  renderExpanded,
}: LedgerTableProps<T>) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const caret: LedgerColumn<T> = {
    key: '__caret',
    width: 22,
    render: (row) => <span className="caret">{openKey === rowKey(row) ? '▾' : '▸'}</span>,
  };
  const cols = renderExpanded ? [caret, ...columns] : columns;

  const cellClass = (c: LedgerColumn<T>) =>
    [c.align === 'right' ? 'r' : null, c.cellClassName].filter(Boolean).join(' ') || undefined;

  const labelOf = (c: LedgerColumn<T>) => c.label ?? (typeof c.header === 'string' ? c.header : '');

  return (
    <div className="scroll">
      <table className="ledger" style={minWidth ? { minWidth } : undefined}>
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
            <tr>
              <td colSpan={cols.length} data-l="">
                {[100, 92, 84, 76].map((w) => (
                  <div className="skel" key={w} style={{ width: `${w}%` }} />
                ))}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={cols.length} data-l="" style={{ color: 'var(--color-muted)' }}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const key = rowKey(row);
              const open = openKey === key;
              return (
                <Fragment key={key}>
                  <tr
                    className={renderExpanded ? `row${open ? ' open' : ''}` : undefined}
                    onClick={renderExpanded ? () => setOpenKey(open ? null : key) : undefined}
                  >
                    {cols.map((c) => (
                      <td key={c.key} data-l={labelOf(c)} className={cellClass(c)}>
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                  {open && renderExpanded && (
                    <tr className="exp">
                      <td colSpan={cols.length}>{renderExpanded(row)}</td>
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
