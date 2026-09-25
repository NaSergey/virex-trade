import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * Отказы стола — в одном месте: их коды видит фронт и переводит по ключу, и
 * разъехавшиеся формулировки одного и того же случая читались бы как разные
 * причины (тот же приём, что `tournament-errors.ts`).
 */
export const gameTableNotFound = () =>
  new NotFoundException({ message: 'Стол не найден', code: 'GAME_TABLE_NOT_FOUND' });

export const gameTableClosed = () =>
  new ConflictException({ message: 'Стол закрыт', code: 'GAME_TABLE_CLOSED' });

export const gameTableFull = () =>
  new ConflictException({ message: 'Все места заняты', code: 'GAME_TABLE_FULL' });

export const gameAlreadySeated = () =>
  new ConflictException({ message: 'Вы уже сидите за этим столом', code: 'GAME_ALREADY_SEATED' });

export const gameNotSeated = () =>
  new ConflictException({ message: 'Вы не сидите за этим столом', code: 'GAME_NOT_SEATED' });

export const gameTableNotEmpty = () =>
  new ConflictException({ message: 'За столом ещё есть игроки', code: 'GAME_TABLE_NOT_EMPTY' });

export const gameBuyInOutOfRange = () =>
  new BadRequestException({ message: 'Сумма не входит в диапазон стола', code: 'GAME_BUY_IN_OUT_OF_RANGE' });

export const gameBadBuyInRange = () =>
  new BadRequestException({
    message: 'Минимальная ставка не может быть больше максимальной',
    code: 'GAME_BAD_BUYIN_RANGE',
  });

/** Гонка за один и тот же seatIndex — не 500, а понятная просьба повторить попытку. */
export const gameSeatRace = () =>
  new ConflictException({ message: 'Место уже заняли, попробуйте другое', code: 'GAME_SEAT_RACE' });

export const gameNotCreatorOrAdmin = () =>
  new ForbiddenException({
    message: 'Закрыть стол может его создатель или владелец сервиса',
    code: 'GAME_NOT_CREATOR_OR_ADMIN',
  });

export const gameBadSeats = () =>
  new BadRequestException({ message: 'Недопустимое число мест для этого типа игры', code: 'GAME_BAD_SEATS' });

export const gameBadBlinds = () =>
  new BadRequestException({
    message: 'Большой блайнд — от 2 монет, минимальный buy-in — не меньше двух больших блайндов',
    code: 'GAME_BAD_BLINDS',
  });

export const gameBadBets = () =>
  new BadRequestException({
    message: 'Ставка — от 2 монет, «до» не меньше «от», минимальный buy-in — не меньше минимальной ставки',
    code: 'GAME_BAD_BETS',
  });
