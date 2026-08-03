'use client';

import { useMemo, useState } from 'react';
import { TagCombo } from '@/entities/tag';
import { Button } from '@/shared/ui/Button';
import { LedgerTable, type LedgerColumn, type LedgerSort } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { MIN_N } from '@/shared/lib/utils/confidence';
import { ConfidenceTrack } from './ConfidenceTrack';
import type { ComboRow } from '../model/comboRows';

/*
 * Колонки до последней: они не зависят ни от одного пропса, и пересобирать их
 * на каждый рендер незачем. Колонка действий объявлена уже внутри компонента —
 * в её шапке стоит кнопка создания, которой нужен обработчик со страницы.
 */
const DATA_COLUMNS: LedgerColumn<ComboRow>[] = [
  /*
   * Закреп — знаком в первой колонке, а не словом в конце строки. Состояние и
   * переключатель здесь одно и то же: закреплённые комбинации стоят наверху
   * списка, и метка, по которой их видно, — та же цель, по которой их
   * открепляют. Отдельная кнопка «закрепить» у правого края повторяла эту
   * метку словами и уводила глаз через всю строку.
   *
   * Звезда, а не квадрат: квадрат в этой системе означает «единица чего-то»,
   * и закреп им не прочитывался вовсе. Знак взят привычный, а слово в
   * подсказке осталось своё — «Закрепить»: на бэкенде это `pinned`, и вводить
   * рядом второе имя тому же состоянию незачем.
   */
  {
    key: 'pin',
    width: 28,
    cellClassName: 'pin-cell',
    render: (r) => (
      <Button
        variant="none"
        className="pin"
        aria-pressed={r.pinned}
        aria-label={r.pinned ? 'Открепить комбинацию' : 'Закрепить комбинацию'}
        title={r.pinned ? 'Открепить' : 'Закрепить'}
        onClick={r.onTogglePin}
      >
        {r.pinned ? '★' : '☆'}
      </Button>
    ),
  },
  {
    key: 'combo',
    header: 'Комбинация',
    render: (r) => <TagCombo names={r.combo.tagNames} colors={r.combo.colors} />,
  },
  {
    key: 'trades',
    header: 'Сделок',
    align: 'right',
    cellClassName: 'n',
    sortKey: 'trades',
    render: (r) => (r.combo.trades < MIN_N ? <span className="dbt">{r.combo.trades} †</span> : r.combo.trades),
  },
  { key: 'wins', header: 'Побед', align: 'right', cellClassName: 'n', sortKey: 'wins', render: (r) => r.combo.wins },
  {
    key: 'winrate',
    header: 'Винрейт и нижняя граница',
    label: 'Винрейт',
    width: 200,
    sortKey: 'winrate',
    render: (r) => <ConfidenceTrack winRate={r.combo.winRate} wilsonLow={r.combo.wilsonLow} />,
  },
  {
    key: 'avg',
    header: 'Средняя',
    align: 'right',
    cellClassName: 'n',
    sortKey: 'avg',
    render: (r) => <Money value={r.combo.avgPnl} />,
  },
  {
    key: 'total',
    header: 'Итог',
    align: 'right',
    cellClassName: 'n',
    sortKey: 'total',
    render: (r) => <Money value={r.combo.totalPnl} large />,
  },
];

/**
 * Колонка действий. Её шапка — не подпись, а само действие: создание новой
 * комбинации встаёт над тем же краем, где у каждой строки стоят её кнопки,
 * поэтому всё, что с комбинациями делают, собрано в одном столбце.
 */
const actsColumn = (onCreate: () => void): LedgerColumn<ComboRow> => ({
  key: 'acts',
  width: 180,
  align: 'right',
  header: (
    <span className="acts">
      <Button variant="bare" onClick={onCreate}>
        + Добавить
      </Button>
    </span>
  ),
  render: (r) => (
    <span className="acts">
      {r.onDismiss && (
        <Button variant="bare" onClick={r.onDismiss}>
          скрыть
        </Button>
      )}
      {/* Пересчёта в строке нет: цифры перечитываются сами при смене периода
          и после любого действия над комбинацией, так что кнопка стояла в
          каждой строке ради случая, которого не бывает. */}
      {r.onDelete && (
        <Button variant="bare" title="удалить" onClick={r.onDelete}>
          ✕
        </Button>
      )}
    </span>
  ),
});

/*
 * По какому числу сортирует каждая колонка.
 *
 * «Винрейт» сортируется по нижней границе, а не по самому винрейту: колонка
 * и заведена ради того, что 100 % на четырёх сделках стоят меньше, чем 65 % на
 * тридцати. Сортировка по верхнему числу поднимала бы наверх ровно те строки,
 * которым таблица не советует верить.
 */
const SORT_VALUE: Record<string, (r: ComboRow) => number> = {
  trades: (r) => r.combo.trades,
  wins: (r) => r.combo.wins,
  winrate: (r) => r.combo.wilsonLow,
  avg: (r) => r.combo.avgPnl,
  total: (r) => r.combo.totalPnl,
};

/**
 * Комбинации — таблица, а не сетка карточек: карточки можно только разглядывать
 * по одной, а вопрос к ним всегда сравнительный — «какое сочетание держится
 * лучше». В таблице сравнение делается взглядом по колонке.
 *
 * Порядок строк выбирает читающий, но закреплённые держатся сверху при любой
 * сортировке: закреп означает «за этим я слежу», и уводить такую строку в
 * середину списка по чужому признаку — терять как раз то, ради чего её
 * закрепили. Внутри каждой из двух групп порядок уже задаёт колонка.
 */
export function ComboTable({ rows, onCreate }: { rows: ComboRow[]; onCreate: () => void }) {
  const [sort, setSort] = useState<LedgerSort>({ key: 'trades', dir: -1 });
  const columns = [...DATA_COLUMNS, actsColumn(onCreate)];

  const sorted = useMemo(() => {
    const value = SORT_VALUE[sort.key];
    if (!value) return rows;
    return [...rows].sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || (value(a) - value(b)) * sort.dir,
    );
  }, [rows, sort]);

  return (
    <LedgerTable
      columns={columns}
      rows={sorted}
      rowKey={(r) => r.key}
      minWidth={980}
      sort={sort}
      // Первый клик по колонке — по убыванию: вопрос к любой из них «где
      // больше», а не «где меньше». Повторный переворачивает.
      onSort={(key) => setSort((s) => (s.key === key ? { key, dir: s.dir === -1 ? 1 : -1 } : { key, dir: -1 }))}
      empty="Пока нет ни одного сочетания из двух и более тегов."
    />
  );
}
