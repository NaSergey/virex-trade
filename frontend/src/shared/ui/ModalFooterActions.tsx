'use client';

import { memo, type ReactNode } from 'react';

export interface ModalFooterActionsProps {
  cancelLabel?: string;
  onCancel: () => void;
  confirmLabel: ReactNode;
  onConfirm: () => void;
  confirmDisabled?: boolean;
}

export const ModalFooterActions = memo(
  ({ cancelLabel = 'Отмена', onCancel, confirmLabel, onConfirm, confirmDisabled }: ModalFooterActionsProps) => (
    <div className="flex gap-2">
      <button
        className="flex-1 cursor-pointer rounded-lg border border-line bg-elevated px-3 py-2 text-xs text-muted transition-all hover:text-fg"
        onClick={onCancel}
      >
        {cancelLabel}
      </button>
      <button
        className="flex-1 cursor-pointer rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-soft disabled:opacity-50"
        onClick={onConfirm}
        disabled={confirmDisabled}
      >
        {confirmLabel}
      </button>
    </div>
  ),
);

ModalFooterActions.displayName = 'ModalFooterActions';
