import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * Отказы турнира — в одном месте: их коды видит фронт и переводит по ключу, и
 * разъехавшиеся формулировки одного и того же случая читались бы как разные
 * причины.
 */
export const tournamentNotFound = () =>
  new NotFoundException({ message: 'Турнир не найден', code: 'TOURNAMENT_NOT_FOUND' });

export const notLobby = () =>
  new ConflictException({ message: 'Турнир уже начался', code: 'TOURNAMENT_NOT_LOBBY' });

export const tournamentFull = () =>
  new ConflictException({ message: 'Все места заняты', code: 'TOURNAMENT_FULL' });

export const tooFewPlayers = () =>
  new ConflictException({
    message: 'Участников меньше, чем призовых мест',
    code: 'TOURNAMENT_TOO_FEW',
  });

export const notCreator = () =>
  new ForbiddenException({ message: 'Это может только создатель турнира', code: 'TOURNAMENT_NOT_CREATOR' });

export const creatorLeave = () =>
  new ConflictException({
    message: 'Создатель не выходит из своего турнира — его можно удалить',
    code: 'TOURNAMENT_CREATOR_LEAVE',
  });

export const badPayout = () =>
  new BadRequestException({
    message: 'Доли призового фонда должны давать сто процентов и не расти к последнему месту',
    code: 'TOURNAMENT_BAD_PAYOUT',
  });
