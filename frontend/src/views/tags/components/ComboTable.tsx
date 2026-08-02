'use client';

import { TagCombo } from '@/entities/tag';
import { Button } from '@/shared/ui/Button';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { MIN_N } from '@/shared/lib/utils/confidence';
import { ConfidenceTrack } from './ConfidenceTrack';
import type { ComboRow } from '../model/comboRows';

const columns: LedgerColumn<ComboRow>[] = [
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
    render: (r) => (r.combo.trades < MIN_N ? <span className="dbt">{r.combo.trades} †</span> : r.combo.trades),
  },
  { key: 'wins', header: 'Побед', align: 'right', cellClassName: 'n', render: (r) => r.combo.wins },
  {
    key: 'winrate',
    header: 'Винрейт и нижняя граница',
    label: 'Винрейт',
    width: 200,
    render: (r) => <ConfidenceTrack winRate={r.combo.winRate} wilsonLow={r.combo.wilsonLow} />,
  },
  {
    key: 'avg',
    header: 'Средняя',
    align: 'right',
    cellClassName: 'n',
    render: (r) => <Money value={r.combo.avgPnl} />,
  },
  {
    key: 'total',
    header: 'Итог',
    align: 'right',
    cellClassName: 'n',
    render: (r) => <Money value={r.combo.totalPnl} large />,
  },
  {
    key: 'acts',
    width: 96,
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
  },
];

/**
 * Комбинации — таблица, а не сетка карточек: карточки можно только разглядывать
 * по одной, а вопрос к ним всегда сравнительный — «какое сочетание держится
 * лучше». В таблице сравнение делается взглядом по колонке.
 *
 * Колонки объявлены снаружи компонента: они не зависят ни от одного пропса, и
 * пересобирать их на каждый рендер незачем.
 */
export function ComboTable({ rows }: { rows: ComboRow[] }) {
  return (
    <LedgerTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.key}
      minWidth={980}
      empty="Пока нет ни одного сочетания из двух и более тегов."
    />
  );
}
