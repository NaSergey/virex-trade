import { ConflictException } from '@nestjs/common';

/**
 * Коды ошибок раздела — строками, как у турниров и столов: фронт разбирает
 * код, а не текст, и перевод сообщения не должен ломать обработку.
 */
export const nothingToClaim = () =>
  new ConflictException({ message: 'Забирать нечего', code: 'BP_NOTHING_TO_CLAIM' });

export const dailyAlreadyClaimed = () =>
  new ConflictException({ message: 'Награда за сегодня уже получена', code: 'BP_DAILY_CLAIMED' });
