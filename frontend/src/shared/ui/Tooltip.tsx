'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';

/**
 * Всплывающая подсказка при наведении/фокусе — через Radix (та же библиотека,
 * что уже даёт диалоги, см. shared/ui/dialog.tsx), не голый CSS-hover.
 *
 * Причина: пузырь на чистом CSS рисовался внутри триггера — а тот в
 * SummaryStrip сидит в `.lbl`, у которой `overflow: hidden` (ради многоточия
 * у длинных подписей). Пузырь обрезался вместе с остальным содержимым.
 * `Portal` у Radix выносит содержимое подсказки в конец `<body>`, вне дерева
 * ячейки — обрезание родителя больше не касается.
 *
 * `delayDuration={0}` — подсказка нужна сразу по наведению, не после паузы:
 * это пояснение к непривычному числу, а не подсказка «на подумать».
 *
 * `Provider` — Radix требует его выше по дереву (без него падает рантайм-
 * ошибкой), а общего провайдера на всё приложение пока нет — заводить его
 * в layout ради одной подсказки было бы преждевременно. Оборачиваем здесь,
 * внутри самого компонента: вложенные `Provider` у Radix — штатный случай.
 */
export function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={0}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content className="tooltip-bubble" sideOffset={6}>
            {text}
            <TooltipPrimitive.Arrow className="tooltip-arrow" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
