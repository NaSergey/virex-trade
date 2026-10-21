import { WORDS } from '../index';
import type { VocabWord } from '../themes';
import { V1 } from './v1';
import { V2 } from './v2';
import { V3 } from './v3';
import { V4 } from './v4';
import { V5 } from './v5';

/**
 * Общий словарь: NGSL 1.2 (New General Service List, Browne, Culligan & Phillips,
 * CC BY-SA 4.0) — 2800 самых нужных слов, переводы и примеры свои; v5 —
 * разговорное дополнение. Слова, которые уже есть в словаре учебника, отсюда
 * убираются: одно слово — одна карточка. Импортируется только страницами, где
 * словарь нужен, — уроки его не грузят.
 */
const BOOK = new Set(WORDS.map((w) => w.en.toLowerCase()));

export const ALL_VOCAB: VocabWord[] = [...V1, ...V2, ...V3, ...V4, ...V5];
export const VOCAB: VocabWord[] = ALL_VOCAB.filter((w) => !BOOK.has(w.en.toLowerCase()));
