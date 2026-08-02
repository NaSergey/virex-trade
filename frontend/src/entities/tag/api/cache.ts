'use client';

import type { useQueryClient } from '@tanstack/react-query';

/**
 * Кеши, зависящие от графа тегов. Любая правка тега (переименование, слияние,
 * удаление) меняет и статистику, и комбинации, и списки сделок — сбрасывать их
 * надо всем набором, иначе на соседней вкладке останутся старые цифры.
 *
 * Список лежит здесь, а не внутри каждой мутации: добавится новый зависимый
 * кеш — про него не забудут ровно потому, что место одно.
 */
export const invalidateTagCaches = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: ['tags'] });
  void qc.invalidateQueries({ queryKey: ['tagStats'] });
  void qc.invalidateQueries({ queryKey: ['tagComboStats'] });
  void qc.invalidateQueries({ queryKey: ['trades'] });
  void qc.invalidateQueries({ queryKey: ['tradeStats'] });
  void qc.invalidateQueries({ queryKey: ['positionTags'] });
};
