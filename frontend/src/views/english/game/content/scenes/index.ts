import { S1 } from './b1';
import type { Scene } from './types';

/** Все сцены по блокам книги; открываются по курсу (`unit` в `openUnits`). */
export const SCENES: Scene[] = [...S1];

export const SCENE_BY_ID: ReadonlyMap<string, Scene> = new Map(SCENES.map((s) => [s.id, s]));
