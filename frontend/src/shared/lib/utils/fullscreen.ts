/**
 * Куда выносить порталы (окна, подсказки): в элемент, развёрнутый во весь
 * экран, если он есть, иначе — в `body` (умолчание Radix). Браузер показывает в
 * полноэкранном режиме только поддерево `:fullscreen`, и окно, вынесенное в
 * `body`, открывалось бы невидимым — так было бы у терминала во весь экран.
 * Читается в момент рендера портала: окно открывают уже в полном экране.
 */
export function portalContainer(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;
  const el = document.fullscreenElement;
  return el instanceof HTMLElement ? el : undefined;
}
