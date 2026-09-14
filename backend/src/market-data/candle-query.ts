import { BadRequestException } from '@nestjs/common';

// Потолок отдачи наружу. Внутренние потребители (market-events) лимит не
// передают и получают весь диапазон — им нужно 17 тысяч часовых свечей за два
// года, и резать их этим числом было бы ошибкой.
export const MAX_LIMIT = 5000;

// Непарсящееся значение не должно молча превращаться в «границы нет»: тогда
// битый `from`/`to` тихо отдаёт последние MAX_LIMIT свечей вместо запрошенного
// окна, и клиент получает HTTP 200 с правдоподобными, но неверными данными.
// Отсутствующий параметр (не передан вовсе) — это законное «границы нет», и
// его правка не касается.
const asDate = (raw: string | undefined, paramName: string): Date | undefined => {
  if (!raw) return undefined;
  const ms = Number(raw);
  if (!Number.isFinite(ms)) {
    throw new BadRequestException(
      `Параметр «${paramName}» не распознан: «${raw}». Формат — миллисекунды эпохи Unix.`,
    );
  }
  return new Date(ms);
};

export interface ParsedCandleQuery {
  timeframe: number;
  from?: Date;
  to?: Date;
  limit: number;
}

/** Параметры свечей из адреса — одни для хранилища и для сгенерированного рынка. */
export function parseCandleQuery(raw: { tf?: string; from?: string; to?: string; limit?: string }): ParsedCandleQuery {
  const requested = Number(raw.limit);
  return {
    timeframe: Number(raw.tf),
    from: asDate(raw.from, 'from'),
    to: asDate(raw.to, 'to'),
    limit: Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : MAX_LIMIT,
  };
}
