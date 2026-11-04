import { S1 } from './b1';
import { S2 } from './b2';
import { S3 } from './b3';
import { S4 } from './b4';
import { S5 } from './b5';
import { S6 } from './b6';
import { S7 } from './b7';
import { S8 } from './b8';
import type { Scene } from './types';

/** Все сцены по блокам книги; открываются по курсу (`unit` в `openUnits`). */
export const SCENES: Scene[] = [...S1, ...S2, ...S3, ...S4, ...S5, ...S6, ...S7, ...S8];

export const SCENE_BY_ID: ReadonlyMap<string, Scene> = new Map(SCENES.map((s) => [s.id, s]));
