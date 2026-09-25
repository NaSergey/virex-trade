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

/** Готовность отмечает только тот, кто вошёл: со стороны здесь решать нечего. */
export const notParticipant = () =>
  new ForbiddenException({
    message: 'Вы не участник этого турнира',
    code: 'TOURNAMENT_NOT_PARTICIPANT',
  });

export const notCreator = () =>
  new ForbiddenException({ message: 'Это может только создатель турнира', code: 'TOURNAMENT_NOT_CREATOR' });

/** Досрочный финал — право шире, чем у остальных действий: ещё и у владельца сервиса. */
export const notTournamentAdmin = () =>
  new ForbiddenException({
    message: 'Завершить турнир может его создатель или владелец сервиса',
    code: 'TOURNAMENT_NOT_ADMIN',
  });

export const notRunning = () =>
  new ConflictException({ message: 'Турнир не идёт', code: 'TOURNAMENT_NOT_RUNNING' });

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
