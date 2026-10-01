import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

/**
 * Отказы биржевого терминала — в одном месте: их коды видит фронт и переводит
 * по ключу (тот же приём, что у турниров).
 */

/** Биржа не ответила вовсе — сеть или таймаут. Ушёл ли ордер, в этом случае неизвестно. */
export const exchangeUnavailable = () =>
  new ServiceUnavailableException({
    message: 'Bybit не ответил. Проверьте позиции и ордера, прежде чем повторять действие.',
    code: 'TERMINAL_EXCHANGE_UNAVAILABLE',
  });

/** Маржи не хватает — самый частый отказ, и у него есть понятное объяснение. */
const NO_MARGIN = new Set([110004, 110007, 110012, 110045, 110052]);

/**
 * Bybit отклонил запрос. Текст биржи отдаётся как есть, параметром: он
 * конкретен («StopLoss should lower than base_price»), а переводить чужие
 * строки нечем. У двух частых причин — свои коды и свои слова.
 */
export function exchangeRejected(retCode: number, retMsg: string) {
  const reason = retMsg || `код ${retCode}`;
  if (NO_MARGIN.has(retCode) || /ab not enough|insufficient/i.test(reason)) {
    return new BadRequestException({
      message: 'Не хватает свободной маржи на этот ордер. Уменьшите риск, поднимите плечо или пополните счёт.',
      code: 'TERMINAL_NO_MARGIN',
    });
  }
  if (retCode === 10005 || /permission denied/i.test(reason)) {
    return new BadRequestException({
      message: 'У API-ключа нет права на торговлю. Проверьте права ключа на Bybit.',
      code: 'TERMINAL_KEY_NO_TRADE',
    });
  }
  return new BadRequestException({
    message: `Bybit отклонил запрос: ${reason}`,
    code: 'TERMINAL_EXCHANGE_REJECTED',
    params: { reason },
  });
}

export const symbolUnknown = (symbol: string) =>
  new BadRequestException({
    message: `Монеты ${symbol} нет среди USDT-перпов Bybit`,
    code: 'TERMINAL_SYMBOL_UNKNOWN',
    params: { symbol },
  });

export const timeframeUnknown = (tf: number) =>
  new BadRequestException({ message: `Неизвестный таймфрейм: ${tf}`, code: 'TERMINAL_TIMEFRAME_UNKNOWN' });

/** Объём считается от расстояния до стопа — без стопа считать не от чего. */
export const stopRequired = () =>
  new BadRequestException({ message: 'Поставьте стоп: от него считается размер позиции', code: 'TERMINAL_STOP_REQUIRED' });

export const stopSide = () =>
  new BadRequestException({ message: 'Стоп стоит не по ту сторону от цены входа', code: 'TERMINAL_STOP_SIDE' });

export const takeSide = () =>
  new BadRequestException({ message: 'Тейк стоит не по ту сторону от цены входа', code: 'TERMINAL_TAKE_SIDE' });

export const qtyTooSmall = (symbol: string, min: string) =>
  new BadRequestException({
    message: `Размер меньше минимального ордера ${symbol} (${min}). Поднимите риск или приблизьте стоп.`,
    code: 'TERMINAL_QTY_TOO_SMALL',
    params: { symbol, min },
  });

export const qtyTooLarge = (symbol: string, max: string) =>
  new BadRequestException({
    message: `Размер больше максимального ордера ${symbol} (${max}). Уменьшите риск или отодвиньте стоп.`,
    code: 'TERMINAL_QTY_TOO_LARGE',
    params: { symbol, max },
  });

export const priceUnavailable = (symbol: string) =>
  new ServiceUnavailableException({
    message: `Нет цены ${symbol} — биржа не ответила`,
    code: 'TERMINAL_PRICE_UNAVAILABLE',
    params: { symbol },
  });

/**
 * В режиме one-way позиция на монету одна: ордер в другую сторону не открывает
 * вторую, а уменьшает первую. Размер «от риска и стопа» у такого ордера ничего
 * не значит, поэтому терминал его не ставит — закрытие делается кнопкой позиции.
 */
export const oppositePosition = (symbol: string) =>
  new BadRequestException({
    message:
      `По ${symbol} открыта позиция в другую сторону, а аккаунт Bybit в режиме one-way: ` +
      'такой ордер её уменьшит, а не откроет новую. Закройте позицию или включите hedge-режим на Bybit.',
    code: 'TERMINAL_OPPOSITE_POSITION',
    params: { symbol },
  });

export const positionNotFound = () =>
  new NotFoundException({ message: 'Позиция не найдена — возможно, она уже закрыта', code: 'TERMINAL_POSITION_NOT_FOUND' });

/**
 * Сетка встала не целиком: часть ордеров уже на бирже, и откатывать их молча
 * нельзя — человек обязан знать, сколько стоит и почему остальные не встали.
 */
export const gridPartial = (placed: number, total: number, reason: string) =>
  new BadRequestException({
    message: `Выставлено ${placed} из ${total} ордеров. Остальные отклонены: ${reason}`,
    code: 'TERMINAL_GRID_PARTIAL',
    params: { placed: String(placed), total: String(total), reason },
  });
