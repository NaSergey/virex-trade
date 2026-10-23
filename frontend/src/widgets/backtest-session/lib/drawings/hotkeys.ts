import type { ToolId } from './types';

/**
 * Горячие клавиши разметки — раскладка TradingView, чтобы пришедшему оттуда не
 * переучиваться. Буквы — по `code` (физической клавише): на macOS Alt+буква
 * печатает спецсимвол, а в русской раскладке `key` — кириллица.
 */
export const TOOL_KEYS: Partial<Record<ToolId, { code: string; shift?: boolean }>> = {
  trend: { code: 'KeyT' },
  hline: { code: 'KeyH' },
  hray: { code: 'KeyJ' },
  vline: { code: 'KeyV' },
  cross: { code: 'KeyC' },
  fib: { code: 'KeyF' },
  rect: { code: 'KeyR', shift: true },
};

export type HotkeyAction =
  | { type: 'tool'; tool: ToolId }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'copy' }
  | { type: 'paste' }
  | { type: 'hide' }
  | { type: 'delete' };

type KeyLike = Pick<KeyboardEvent, 'code' | 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

export function hotkeyOf(e: KeyLike): HotkeyAction | null {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.altKey && !e.shiftKey && e.code === 'KeyH') return { type: 'hide' };
  if (mod && !e.altKey) {
    if (e.code === 'KeyZ') return e.shiftKey ? { type: 'redo' } : { type: 'undo' };
    if (e.code === 'KeyY' && !e.shiftKey) return { type: 'redo' };
    if (e.code === 'KeyC' && !e.shiftKey) return { type: 'copy' };
    if (e.code === 'KeyV' && !e.shiftKey) return { type: 'paste' };
    return null;
  }
  if (e.altKey && !mod) {
    for (const [tool, k] of Object.entries(TOOL_KEYS) as [ToolId, { code: string; shift?: boolean }][]) {
      if (k.code === e.code && !!k.shift === e.shiftKey) return { type: 'tool', tool };
    }
    return null;
  }
  if (!mod && !e.altKey && (e.key === 'Delete' || e.key === 'Backspace')) return { type: 'delete' };
  return null;
}

/** Подпись клавиши для подсказки: «Alt+T», «Alt+Shift+R». */
export function toolShortcut(tool: ToolId): string | null {
  const k = TOOL_KEYS[tool];
  if (!k) return null;
  return `Alt+${k.shift ? 'Shift+' : ''}${k.code.slice(3)}`;
}

/** Нажатие в поле ввода — его собственное: Ctrl+Z там отменяет набранное, а не рисунок. */
export function isTypingTarget(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null;
  return !!n && (n.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(n.tagName));
}
