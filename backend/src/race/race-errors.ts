import { BadRequestException, ConflictException } from '@nestjs/common';

/** Отказы гонки — коды видит фронт и переводит по ключу `errors.<code>`. */
export const raceBadStake = () =>
  new BadRequestException({
    message: 'Такой ставки нет',
    code: 'RACE_BAD_STAKE',
  });

export const raceBadCar = () =>
  new BadRequestException({
    message: 'Такой машины нет',
    code: 'RACE_BAD_CAR',
  });

export const raceAlreadyIn = () =>
  new ConflictException({ message: 'Вы уже в гонке', code: 'RACE_ALREADY_IN' });

export const raceNotIn = () =>
  new ConflictException({
    message: 'Вы не в лобби гонки',
    code: 'RACE_NOT_IN',
  });

export const raceStarted = () =>
  new ConflictException({
    message: 'Гонка уже началась — выйти нельзя',
    code: 'RACE_STARTED',
  });
