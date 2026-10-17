'use client';

import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import { DEFAULT_SYMBOL } from '../api/types';

const KEY = 'virex.terminal.symbol';
const decodeSymbol = (raw: string | null) => raw ?? DEFAULT_SYMBOL;
const encodeSymbol = (symbol: string) => (symbol === DEFAULT_SYMBOL ? null : symbol);

/**
 * Монета графика в живом режиме — та, на которой человек остановился, и после
 * перезагрузки страницы. Выбор на устройстве и общий для эфира и биржевого
 * терминала: это одна и та же монетная витрина. История и тренажёр монет не
 * выбирают (там только BTC), поэтому их сюда не пускают.
 */
export const useLiveSymbol = () => usePersistentValue(KEY, decodeSymbol, DEFAULT_SYMBOL, encodeSymbol);

/** Та же монета вне React — её свечи греет прогрев терминала. Только в браузере. */
export const readLiveSymbol = () => decodeSymbol(localStorage.getItem(KEY));
