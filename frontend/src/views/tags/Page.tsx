'use client';

import { useState } from 'react';
import { useTags, useTagStats, useCreateSavedCombo, type TagItem } from '@/entities/tag';
import { Wrap } from '@/shared/ui/Wrap';
import { Button } from '@/shared/ui/Button';
import { PageHead } from '@/shared/ui/PageHead';
import { ConfirmDialog, type ConfirmRequest } from '@/shared/ui/ConfirmDialog';
import { MIN_N } from '@/shared/lib/utils/confidence';
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
      <PeriodStrip spaced period={period} title="Теги за период" trades={statsData?.totalTrades} />

      {/* Заголовка «Комбинации» над таблицей нет: это же слово стоит подписью
          первой колонки и в кнопке рядом — три раза подряд об одном. Что здесь
          за таблица, говорит колонка; кнопка встала на строку названия
          страницы, и раздел стал на две строки короче. */}
      <PageHead
        title="Теги"
        lede="Разметка сделок и статистика по ней. Что с чем встречалось вместе, система находит сама."
      >
        <Button variant="bare" onClick={() => setComboDialog(true)}>
          + своя комбинация
        </Button>
      </PageHead>

      <ComboTable rows={comboRows} />

      <p className="foot">
        <b>†</b> Треугольник — измеренный винрейт, янтарная риска — нижняя граница при 95 %: чем короче
        выборка, тем дальше они расходятся. Шесть сделок со 100 % гарантируют не больше 54 %, поэтому
        строки короче {MIN_N} сделок помечены <b>†</b> — доверять им рано.
      </p>

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
