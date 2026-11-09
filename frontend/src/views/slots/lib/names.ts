import type { SlotSymbol } from '@/entities/slots';

/** Тикер символа — как он подписан на ленте котировок и в истории. */
export const TICKER: Record<SlotSymbol, string> = {
  cherry: 'PUMP',
  lemon: 'DOGE',
  plum: 'SOL',
  grapes: 'ROCKET',
  bell: 'ETH',
  bar: 'HODL',
  seven: 'BTC',
  diamond: 'GEM',
  wild: 'MOON',
  scatter: 'AIRDROP',
  chest: 'VAULT',
  wheel: 'WHEEL',
};

/** Свечи фона графика: случайное блуждание с зерном — одна картинка у всех. */
export function backdropCandles(n: number, seed = 7) {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const out: { o: number; c: number; h: number; l: number }[] = [];
  let p = 50;
  for (let i = 0; i < n; i++) {
    const drift = Math.sin(i / 9) * 1.4 + 0.35;
    const c = Math.min(92, Math.max(8, p + drift + (rnd() - 0.5) * 9));
    const h = Math.max(p, c) + rnd() * 4;
    const l = Math.min(p, c) - rnd() * 4;
    out.push({ o: p, c, h, l });
    p = c;
  }
  return out;
}
