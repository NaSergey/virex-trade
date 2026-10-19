/** Профиль трейдера — HyperDash: кривая, позиции и сделки адреса. Сменить сайт — здесь. */
export const profileUrl = (address: string) => `https://hyperdash.info/trader/${address}`;

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Доля → «12 %»: здесь проценты — свойства кривой, а не деньги, поэтому без знака. */
export const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)} %`);

/** Количество монет: крупное — компактно, мелкое — с достаточными знаками («12.5K», «3.42», «0.0153»). */
export function qty(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e6) return `${+(v / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${+(v / 1e3).toFixed(1)}K`;
  if (a >= 100) return String(Math.round(v));
  if (a >= 1) return String(+v.toFixed(2));
  return String(+v.toPrecision(3));
}

/** Баланс и оборот — компактно: в таблице на дюжину колонок полные разряды не помещаются. */
export function usd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${+(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${+(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

/** Сколько длилась сделка: «45 м», «5 ч 10 м», «3 д 4 ч» — две старшие единицы; буквы — по языку. */
export function duration(ms: number, u: { d: string; h: string; m: string }): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} ${u.m}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ${u.h} ${min % 60} ${u.m}`;
  return `${Math.floor(h / 24)} ${u.d} ${h % 24} ${u.h}`;
}
