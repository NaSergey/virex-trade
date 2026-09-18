import { COINS_PER_USDT } from '../coins/coins.config';
import { UNITS_PER_USDT } from './donation.config';

/**
 * Сколько монет даёт донат.
 *
 * Считается от суммы, которую человек ЗАПРОСИЛ (5.00), а не от той, что он
 * переводит с уникальным хвостом (5.0043): хвост — служебная добавка ради
 * опознания платежа на общем кошельке, и продавать за неё монеты значило бы
 * брать деньги за собственный механизм сверки.
 *
 * Целочисленно и вниз: монета не делится, а округление вверх позволило бы
 * купить монету за ноль.
 */
export function coinsForDonation(requestedUnits: bigint): number {
  if (requestedUnits <= 0n) return 0;
  return Number((requestedUnits * BigInt(COINS_PER_USDT)) / UNITS_PER_USDT);
}
