'use client';

import { useTranslations } from 'next-intl';
import {
  useTagComboStats,
  useCreateSavedCombo,
  useUpdateSavedCombo,
  useDeleteSavedCombo,
  useDismissCombo,
  type TagComboBucket,
} from '@/entities/tag';
import type { ConfirmRequest } from '@/shared/ui/ConfirmDialog';

/** Строка таблицы комбинаций: сам срез плюс то, что с ним можно сделать. */
export interface ComboRow {
  key: string;
  combo: TagComboBucket;
  pinned: boolean;
  onTogglePin: () => void;
  /** Только у сохранённой комбинации — удаление насовсем. */
  onDelete?: () => void;
  /** Только у предложенной — убрать из предложений. */
  onDismiss?: () => void;
}

/** Ключ набора тегов, не зависящий от порядка — им сверяются авто- и сохранённые комбинации. */
export const comboKey = (tagIds: string[]) => [...tagIds].sort().join('|');

/**
 * Сводит два разных списка комбинаций в один список строк таблицы.
 *
 * Сохранённые и предложенные комбинации приходят с сервера порознь и
 * поддерживают разные действия (сохранённую можно открепить и удалить,
 * предложенную — закрепить и скрыть), но в таблице это одна колонка строк.
 * Здесь живёт вся эта развилка — вместе с тем, какие мутации за какой кнопкой
 * стоят, — чтобы разметке таблицы досталось только «что нарисовать».
 *
 * `askConfirm` передаётся снаружи: удаление необратимо и подтверждается общим
 * диалогом продукта, а владеть его состоянием должна страница, а не строка.
 */
export function useComboRows(
  days: number,
  askConfirm: (request: ConfirmRequest) => void,
): { rows: ComboRow[]; isLoading: boolean } {
  const t = useTranslations('tags');
  // isLoading, а не isFetching: при смене периода прежние комбинации остаются
  // на месте (keepPreviousData), и сыпать поверх них заглушки значило бы
  // стирать уже прочитанное ради полусекунды ожидания. Заглушки — только на
  // первом заходе, когда показывать нечего.
  const { data, isLoading } = useTagComboStats(days);
  const pin = useCreateSavedCombo();
  const updateCombo = useUpdateSavedCombo();
  const deleteCombo = useDeleteSavedCombo();
  const dismiss = useDismissCombo();

  const savedKeys = new Set((data?.saved ?? []).map((s) => comboKey(s.tagIds)));

  const rows = [
    // Закреплённые — первыми: открепление не убирает карточку из списка, поэтому
    // без этой сортировки нажатие «открепить» никак не отражалось бы на порядке.
    ...[...(data?.saved ?? [])]
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.trades - a.trades || b.winRate - a.winRate)
      .map((c) => ({
        key: c.id,
        combo: c,
        pinned: c.pinned,
        onTogglePin: () => updateCombo.mutate({ id: c.id, pinned: !c.pinned }),
        // Оптимистично добавленная карточка ещё не существует на сервере —
        // удалять нечего.
        onDelete: c.id.startsWith('pending-')
          ? undefined
          : () =>
              askConfirm({
                title: t('deleteComboConfirmTitle'),
                subtitle: t('deleteComboSubtitle', { names: c.tagNames.join(' + ') }),
                consequences: [
                  t('deleteComboConsequence1'),
                  t('deleteComboConsequence2'),
                  t('deleteComboConsequence3'),
                ],
                word: t('deleteWord'),
                onConfirm: () => deleteCombo.mutate(c.id),
              }),
      })),
    ...(data?.combos ?? [])
      .filter((c) => !savedKeys.has(comboKey(c.tagIds)))
      .map((c) => ({
        key: comboKey(c.tagIds),
        combo: c,
        pinned: false,
        onTogglePin: () => pin.mutate({ tagIds: c.tagIds, optimistic: c }),
        onDismiss: () => dismiss.mutate(c.tagIds),
      })),
  ];

  return { rows, isLoading };
}
