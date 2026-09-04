'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';

export type DonationStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELED';

export interface DonationConfig {
  enabled: boolean;
  currency: string;
  network: string;
  receivingAddress: string | null;
  minAmount: string;
  maxAmount: string;
  ttlSeconds: number;
  /** Максимум, на который сервер поднимет сумму ради уникального хвоста. */
  maxSurcharge: string;
  /** Сколько собрано за всё время — сумма подтверждённых донатов. */
  totalRaised: string;
}

export interface Donation {
  id: string;
  status: DonationStatus;
  currency: string;
  network: string;
  receivingAddress: string;
  requestedAmount: string;
  /** Перевести нужно ровно столько — по этим знакам платёж и опознаётся. */
  expectedAmount: string;
  amountSurcharge: string;
  paidAmount: string | null;
  transactionHash: string | null;
  fromAddress: string | null;
  createdAt: string;
  expiresAt: string;
  secondsLeft: number;
  paidAt: string | null;
  paidAfterExpiry: boolean;
  explorerUrl: string | null;
}

export interface DonationCreated extends Donation {
  qrPayload: string;
  qrDataUrl: string | null;
}

export const useDonationConfig = () =>
  useQuery({
    queryKey: ['donationConfig'],
    queryFn: () => apiJson<DonationConfig>('/api/donations/config'),
    staleTime: 5 * 60_000,
  });

export const useCreateDonation = () =>
  useMutation({
    mutationFn: (amount: string) =>
      apiJson<DonationCreated>('/api/donations', {
        method: 'POST',
        body: JSON.stringify({ amount }),
      }),
  });

/**
 * Статус открытого окна оплаты.
 *
 * Опрос раз в пять секунд и только пока окно живо: платёж становится
 * необратимым примерно за минуту, а окно ждёт десять — чаще спрашивать нечего,
 * реже — человек будет смотреть на «ожидаем перевод» уже после зачисления.
 * Как только статус перестал быть PENDING, опрос прекращается сам.
 */
export const useDonation = (id: string | null) =>
  useQuery({
    queryKey: ['donation', id],
    queryFn: () => apiJson<Donation>(`/api/donations/${id}`),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data && query.state.data.status !== 'PENDING' ? false : 5_000,
  });

export const useCancelDonation = () =>
  useMutation({
    mutationFn: (id: string) =>
      apiJson<Donation>(`/api/donations/${id}/cancel`, { method: 'POST' }),
  });
