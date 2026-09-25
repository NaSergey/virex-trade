import { BadRequestException, ConflictException } from '@nestjs/common';

/** Отказы раунда блэкджека — коды видит фронт и переводит по ключу. */
export const bjNotBlackjack = () =>
  new BadRequestException({ message: 'Это не стол блэкджека', code: 'BJ_NOT_BLACKJACK' });

export const bjNotBetting = () =>
  new ConflictException({ message: 'Ставки сейчас не принимаются', code: 'BJ_NOT_BETTING' });

export const bjBadBet = () =>
  new BadRequestException({ message: 'Ставка вне лимитов стола или больше стека', code: 'BJ_BAD_BET' });

export const bjNoRound = () => new ConflictException({ message: 'Раунд сейчас не идёт', code: 'BJ_NO_ROUND' });

export const bjNotYourTurn = () =>
  new ConflictException({ message: 'Сейчас не ваш ход', code: 'BJ_NOT_YOUR_TURN' });

export const bjBadAction = () =>
  new BadRequestException({ message: 'Такое действие сейчас недоступно', code: 'BJ_BAD_ACTION' });
