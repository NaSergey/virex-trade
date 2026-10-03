/**
 * Наклонная белая полоса у правого края экрана, во всю высоту — ровная, без
 * текстуры, пятен, мазков и затемнений (требование владельца 2026-10-02).
 * `slice` держит пропорции: на узком экране видна середина кадра.
 */
export function Stripe() {
  return (
    <svg className="pfs-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <path className="pfs-paint" d="M1260 0H1780L1320 900H800Z" />
    </svg>
  );
}
