/**
 * Выгрузка фраз для озвучки: всё, что раздел произносит, — слова и примеры
 * учебника и общего словаря, примеры уроков, фразы упражнений, реплики сцен
 * игры (каждое сочетание переменных) и их ключевые фразы. Пишет JSON
 * `[{ id, text }]`; озвучивает его `audio.py`.
 *
 *   npx vite-node --config vitest.config.ts src/views/english/tools/export-texts.ts <out.json>
 */
import { writeFileSync } from 'node:fs';
import { EXERCISES, LESSONS, WORDS } from '../content';
import { ALL_VOCAB } from '../content/vocab';
import { audioId } from '../model/audio';
import { fullSentence } from '../model/sentence';
import { SCENES } from '../game/content/scenes';
import { isReply } from '../game/content/scenes/types';
import { combos } from '../game/model/scene';

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
// Реплики сцен: собеседник, его реакции на неверный ответ (тексты движка — тоже) и ключевые фразы.
for (const scene of SCENES) {
  for (const step of scene.steps) {
    if (!isReply(step)) combos(scene, step.npc).forEach(add);
    else step.reply.forEach((o) => o.react && combos(scene, o.react).forEach(add));
  }
  scene.phrases.forEach(([en]) => add(en));
}
['Sorry?', 'Never mind.'].forEach(add);

const out = process.argv[2] ?? 'english-texts.json';
writeFileSync(out, JSON.stringify([...texts].map((text) => ({ id: audioId(text), text })), null, 0));
console.log(`${texts.size} texts → ${out}`);
