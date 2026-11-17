import type { DrawingKind } from '../../../lib/drawings/types';
import { polylineShape, type ShapeRenderer } from './ctx';

/**
 * Отрисовка новых видов (спека 2026-11-17) — по группам, в своих файлах. Вид без
 * своей ветки рисуется ломаной по точкам: так он хотя бы виден и выделяется.
 */
const RENDERERS: Partial<Record<DrawingKind, ShapeRenderer>> = {};

export const renderExtra: ShapeRenderer = (d, c) => (RENDERERS[d.kind] ?? polylineShape)(d, c);

/** Группа регистрирует свои ветки — здесь, а не в `DrawingLayer`. */
export function registerShapes(map: Partial<Record<DrawingKind, ShapeRenderer>>) {
  Object.assign(RENDERERS, map);
}
