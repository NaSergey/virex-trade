import type { DrawingKind } from '../../../lib/drawings/types';
import { polylineShape, type ShapeRenderer } from './ctx';
import { FIB_SHAPES } from './fibs';
import { FIGURE_SHAPES } from './figures';
import { LABEL_SHAPES } from './labels';
import { PATTERN_SHAPES } from './patterns';

/**
 * Отрисовка новых видов (спека 2026-11-17) — по группам, в своих файлах. Вид без
 * своей ветки рисуется ломаной по точкам: так он хотя бы виден и выделяется.
 */
const RENDERERS: Partial<Record<DrawingKind, ShapeRenderer>> = {
  ...FIB_SHAPES,
  ...FIGURE_SHAPES,
  ...LABEL_SHAPES,
  ...PATTERN_SHAPES,
};

export const renderExtra: ShapeRenderer = (d, c) => (RENDERERS[d.kind] ?? polylineShape)(d, c);
