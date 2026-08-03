'use client';

import { useState } from 'react';
import { useTags, useTagStats, useCreateSavedCombo, type TagItem } from '@/entities/tag';
import { Wrap } from '@/shared/ui/Wrap';
import { ConfirmDialog, type ConfirmRequest } from '@/shared/ui/ConfirmDialog';
import { usePeriodFilter, PeriodStrip } from '@/features/period-filter';
import { useComboRows } from './model/comboRows';
import { ComboTable } from './components/ComboTable';
import { AllTags } from './components/AllTags';
import { EditTagDialog } from './components/EditTagDialog';
import { CreateComboDialog } from './components/CreateComboDialog';

/**
 * Теги: сначала комбинации (что с чем встречалось вместе и чем это кончалось),
 * потом сами теги по одному.
 *
 * Страница здесь — только порядок разделов и то, что принадлежит ей целиком:
 * период, за который всё посчитано, и два диалога поверх. Как устроена каждая
 * таблица, знает она сама.
 */
export function TagsPage() {
  const period = usePeriodFilter();
  const { effectiveDays } = period;
  const [editing, setEditing] = useState<TagItem | null>(null);
  const [comboDialog, setComboDialog] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const { data: tagsData } = useTags();
  const { data: statsData } = useTagStats(effectiveDays);
  const pin = useCreateSavedCombo();
  const comboRows = useComboRows(effectiveDays, setConfirm);

  return (
    <Wrap page>
      <PeriodStrip spaced period={period} trades={statsData?.totalTrades} />

      {/* Ни заголовка страницы, ни заголовка «Комбинации» над таблицей: страница
          названа пунктом навигации, а что за таблица — говорит подпись первой
          колонки. Создание живёт последней строкой самой таблицы — отдельной
          строкой над ней кнопка висела в поле, ни к чему не привязанная. */}
      <ComboTable rows={comboRows} onCreate={() => setComboDialog(true)} />

      <AllTags
        tags={statsData?.tags ?? []}
        onEditTag={(tagId) => {
          const tag = (tagsData?.tags ?? []).find((x) => x.id === tagId);
          if (tag) setEditing(tag);
        }}
        askConfirm={setConfirm}
      />

      {editing && <EditTagDialog tag={editing} onClose={() => setEditing(null)} />}
      {comboDialog && (
        <CreateComboDialog
          tags={tagsData?.tags ?? []}
          isPending={pin.isPending}
          onCreate={(tagIds) => {
            pin.mutate({ tagIds });
            setComboDialog(false);
          }}
          onClose={() => setComboDialog(false)}
        />
      )}
      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </Wrap>
  );
}
