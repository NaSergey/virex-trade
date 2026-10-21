/**
 * Выгрузка фраз для озвучки: всё, что раздел произносит, — слова и примеры
 * учебника и общего словаря, примеры уроков, фразы упражнений. Пишет JSON
 * `[{ id, text }]`; озвучивает его `audio.py`.
 *
 *   npx vite-node --config vitest.config.ts src/views/english/tools/export-texts.ts <out.json>
 */
import { writeFileSync } from 'node:fs';
import { EXERCISES, LESSONS, WORDS } from '../content';
import { ALL_VOCAB } from '../content/vocab';
import { audioId } from '../model/audio';
import { fullSentence } from '../model/sentence';

const texts = new Set<string>();
const add = (t: string | undefined) => {
  const s = t?.trim();
  if (s) texts.add(s);
};

for (const w of WORDS) {
  add(w.en);
  add(w.example?.[0]);
}
for (const w of ALL_VOCAB) {
  add(w.en);
  add(w.example?.[0]);
}
for (const lesson of LESSONS.values()) {
  for (const b of lesson.blocks) {
    if (b.type === 'examples') b.items.forEach(([en]) => add(en));
    if (b.type === 'rule') b.rows.forEach(([, en]) => add(en));
  }
}
for (const e of EXERCISES) add(fullSentence(e));

const out = process.argv[2] ?? 'english-texts.json';
writeFileSync(out, JSON.stringify([...texts].map((text) => ({ id: audioId(text), text })), null, 0));
console.log(`${texts.size} texts → ${out}`);
