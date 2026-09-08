/**
 * Брейкпоинты лендинга. Значения — те же самые числа, что в двух
 * `@media (max-width: …)` в globals.css: одна точка правды для CSS и для
 * `gsap.matchMedia()` в сценах, которым нужна JS-логика поверх CSS.
 */
export const MOBILE_MAX_WIDTH = 720;
export const TABLET_MAX_WIDTH = 1100;

export const BREAKPOINTS = {
  mobile: `(max-width: ${MOBILE_MAX_WIDTH}px)`,
  tablet: `(min-width: ${MOBILE_MAX_WIDTH + 1}px) and (max-width: ${TABLET_MAX_WIDTH}px)`,
  desktop: `(min-width: ${TABLET_MAX_WIDTH + 1}px)`,
} as const;
