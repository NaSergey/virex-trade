'use client';

import { useTranslations } from 'next-intl';
import type { TagType } from '../api/types';

/** Подписи категорий тега («Сетап» / «Эмоция» / «Ошибка») — с переводом. */
export function useTagTypeLabels(): Record<TagType, string> {
  const t = useTranslations('tags');
  return {
    setup: t('typeSetup'),
    emotion: t('typeEmotion'),
    mistake: t('typeMistake'),
  };
}
