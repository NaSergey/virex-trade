import { BadRequestException, ConflictException } from '@nestjs/common';

/** Отказы раздачи покера — коды видит фронт и переводит по ключу. */
export const pokerNoHand = () =>
  new ConflictException({ message: 'Раздача сейчас не идёт', code: 'POKER_NO_HAND' });

export const pokerNotYourTurn = () =>
  new ConflictException({ message: 'Сейчас не ваш ход', code: 'POKER_NOT_YOUR_TURN' });

export const pokerBadAction = () =>
  new BadRequestException({ message: 'Такое действие сейчас недоступно', code: 'POKER_BAD_ACTION' });

export const pokerNotPoker = () =>
  new BadRequestException({ message: 'Это не покерный стол', code: 'POKER_NOT_POKER' });
