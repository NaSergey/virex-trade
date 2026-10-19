/** Профиль трейдера — HyperDash: кривая, позиции и сделки адреса. Сменить сайт — здесь. */
export const profileUrl = (address: string) => `https://hyperdash.info/trader/${address}`;

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Доля → «12 %»: здесь проценты — свойства кривой, а не деньги, поэтому без знака. */
export const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)} %`);

/** Баланс и оборот — компактно: в таблице на дюжину колонок полные разряды не помещаются. */
export function usd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${+(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${+(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}
