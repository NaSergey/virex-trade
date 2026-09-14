/** Иконка сетки Фибоначчи: уровни горизонталями и пунктирная диагональ между точками — как в терминалах. В lucide такой нет. */
export function FibIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true">
      <path d="M3 4h18M3 9.5h18M3 14.5h18M3 20h18" />
      <path d="M5 20L19 4" strokeDasharray="2 2.5" strokeWidth={1.25} />
      <circle cx="5" cy="20" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="4" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
