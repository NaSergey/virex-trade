/**
 * Задания дня — три в день: учебное, игровое и на сцену (`model/meta.ts`,
 * `questsOf`). Прогресс — сумма или максимум по забегам дня.
 */
export type QuestMetric =
  | 'voice'
  | 'recall'
  | 'newWords'
  | 'revenge'
  | 'elites'
  | 'reachedBoss'
  | 'maxCombo'
  | 'cleanFights'
  | 'scenes3'
  | 'scenes'
  | 'sceneUp';

export interface QuestDef {
  id: string;
  group: 'learn' | 'play' | 'scene';
  text: string;
  target: number;
  metric: QuestMetric;
  /** Нужно распознавание речи. */
  speech?: true;
  /** Нужны новые слова в дневном лимите. */
  needsNew?: true;
}

export const QUESTS: QuestDef[] = [
  { id: 'speak10', group: 'learn', text: 'Скажи вслух 10 слов', target: 10, metric: 'voice', speech: true },
  { id: 'recall15', group: 'learn', text: 'Вспомни вводом 15 слов', target: 15, metric: 'recall' },
  { id: 'new5', group: 'learn', text: 'Познакомься с 5 новыми словами', target: 5, metric: 'newWords', needsNew: true },
  { id: 'revenge5', group: 'learn', text: 'Отбей 5 слов, на которых ошибся', target: 5, metric: 'revenge' },
  { id: 'elite', group: 'play', text: 'Победи элиту', target: 1, metric: 'elites' },
  { id: 'boss', group: 'play', text: 'Дойди до хранителя', target: 1, metric: 'reachedBoss' },
  { id: 'combo10', group: 'play', text: 'Серия из 10 верных', target: 10, metric: 'maxCombo' },
  { id: 'clean', group: 'play', text: 'Бой без единой ошибки', target: 1, metric: 'cleanFights' },
  { id: 'scene3', group: 'scene', text: 'Пройди сцену на три звезды', target: 1, metric: 'scenes3' },
  { id: 'scenes2', group: 'scene', text: 'Пройди две сцены', target: 2, metric: 'scenes' },
  { id: 'sceneUp', group: 'scene', text: 'Подними уровень сцены', target: 1, metric: 'sceneUp' },
];
