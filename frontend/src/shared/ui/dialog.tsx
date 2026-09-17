'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/utils/css';
import { Button, type ButtonVariant } from '@/shared/ui/Button';

/**
 * Диалог гроссбуха: рамка в один волос цветом краски и три жёстких зоны —
 * шапка (.dh), тело (.db), подвал с действиями (.df).
 *
 * Крестика в углу нет намеренно: закрывают Esc, кликом по затемнению или
 * кнопкой в подвале, а четвёртый способ — это ещё один элемент управления там,
 * где их и так достаточно.
 */
const Dialog = DialogPrimitive.Root;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay ref={ref} className={cn('dlg-backdrop fixed inset-0 z-50', className)} {...props} />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Шире дефолтных 520px — для разбора одной сделки со свечами. */
    wide?: boolean;
    /**
     * Отдать фокус первому полю внутри — только там, где окно и открывают ради
     * ввода (набрать слово в подтверждении необратимого). См. ниже, почему это
     * не умолчание.
     */
    autoFocusContent?: boolean;
  }
>(({ className, children, wide = false, autoFocusContent = false, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'dlg fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
        wide && 'max-w-[min(94vw,860px)]',
        className,
      )}
      /**
       * Фокус при открытии остаётся на самом окне, а не уезжает на первый
       * интерактивный элемент. Причина конкретная: у половины окон продукта
       * первым идёт слайдер (`input[type=range]` — плечо, риск, уровни,
       * объём закрытия), а браузер, фокусируя range, подтягивает его в область
       * видимости и заодно сбрасывает прокрутку страницы в ноль. На странице
       * сессии это читалось как «любое окно подбрасывает экран наверх».
       * Ловушка фокуса и Esc продолжают работать: окно само по себе
       * фокусируемо (tabIndex=-1 у Radix), с него Tab идёт внутрь окна.
       */
      onOpenAutoFocus={(e) => {
        if (autoFocusContent) return;
        e.preventDefault();
        (e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
      }}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

/**
 * Шапка: название диалога и одна строка контекста под ним («SOLUSDT · закрыта
 * 28 июл»). Строка обязательна по смыслу — она отвечает на «чего именно это
 * касается», без неё диалог теряет привязку к строке журнала.
 */
function DialogHeader({
  title,
  subtitle,
  aside,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Одно число справа от заголовка — итог, который относится ко всему окну. */
  aside?: React.ReactNode;
}) {
  return (
    <div className="dh">
      <div className="dh-main">
        <DialogPrimitive.Title asChild>
          <h3>{title}</h3>
        </DialogPrimitive.Title>
        {subtitle != null && (
          <DialogPrimitive.Description asChild>
            <p>{subtitle}</p>
          </DialogPrimitive.Description>
        )}
      </div>
      {aside != null && <div className="dh-aside">{aside}</div>}
    </div>
  );
}

const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('db', className)} {...props} />
);

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('df', className)} {...props} />
);

/**
 * Подвал диалога: «Отмена» и одно действие, ради которого диалог открывали.
 *
 * Все четыре диалога продукта заканчиваются одинаково, и порядок кнопок здесь —
 * не вкусовщина: отмена слева, действие справа, потому что справа заканчивается
 * чтение. Пока это писалось в каждом диалоге руками, порядок и подписи могли
 * разойтись — а именно они решают, что человек нажмёт не глядя.
 */
function DialogActions({
  confirmLabel,
  onConfirm,
  onCancel,
  confirmDisabled,
  /** `risk` — для необратимого: цвет убытка вместо заливки. */
  confirmVariant = 'solid',
  cancelLabel,
}: {
  confirmLabel: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirmDisabled?: boolean;
  confirmVariant?: Extract<ButtonVariant, 'solid' | 'risk'>;
  cancelLabel?: React.ReactNode;
}) {
  const t = useTranslations('common');
  return (
    <DialogFooter>
      <Button variant="bare" onClick={onCancel}>
        {cancelLabel ?? t('cancel')}
      </Button>
      <Button variant={confirmVariant} disabled={confirmDisabled} onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </DialogFooter>
  );
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogActions,
  DialogClose,
};
