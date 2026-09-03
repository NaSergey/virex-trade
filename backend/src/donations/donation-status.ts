/**
 * Состояния доната. Строкой, а не enum'ом Postgres — как и остальные статусы в
 * этой схеме (`Trade.direction`, `TradeContext.basis`): добавление состояния не
 * должно требовать миграции типа.
 *
 * PENDING  — ждём перевод, сумма закреплена за интентом;
 * PAID     — перевод найден и подтверждён сетью, деньги наши;
 * EXPIRED  — 10 минут вышли, перевода не было (сумма ещё некоторое время
 *            остаётся закреплённой — см. Donation.matchUntil);
 * CANCELED — пользователь закрыл окно оплаты сам.
 */
export const DONATION_STATUSES = [
  'PENDING',
  'PAID',
  'EXPIRED',
  'CANCELED',
] as const;
export type DonationStatus = (typeof DONATION_STATUSES)[number];

/** Состояния, которым ещё можно засчитать перевод. */
export const CLAIMABLE_STATUSES: DonationStatus[] = ['PENDING', 'EXPIRED'];

/** Состояния входящего перевода в журнале сверки. */
export const TRANSFER_STATUSES = [
  'NEW',
  'MATCHED',
  'UNMATCHED',
  'DUPLICATE_TX',
] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];
