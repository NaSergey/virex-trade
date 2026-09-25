import { BadRequestException, ConflictException } from '@nestjs/common';

/** Отказы джетпака — коды видит фронт и переводит по ключу `errors.<code>`. */
export const jpNotBetting = () =>
  new ConflictException({ message: 'Ставки сейчас не принимаются', code: 'JETPACK_NOT_BETTING' });

export const jpAlreadyBet = () =>
  new ConflictException({ message: 'Ставка на этот раунд уже сделана', code: 'JETPACK_ALREADY_BET' });

export const jpBadBet = () =>
  new BadRequestException({ message: 'Ставка или автовывод вне лимитов', code: 'JETPACK_BAD_BET' });

export const jpNoBet = () => new ConflictException({ message: 'Активной ставки нет', code: 'JETPACK_NO_BET' });

export const jpNotFlying = () =>
  new ConflictException({ message: 'Ракета ещё не взлетела', code: 'JETPACK_NOT_FLYING' });

export const jpTooLate = () =>
  new ConflictException({ message: 'Не успели: ракета уже взорвалась', code: 'JETPACK_TOO_LATE' });
