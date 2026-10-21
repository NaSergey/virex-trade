'use client';

/** Четыре числа прогресса в ряд (на телефоне 2×2). */
export function Summary({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="en-sum">
      {items.map((it) => (
        <div key={it.label}>
          <dt className="muted">{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
