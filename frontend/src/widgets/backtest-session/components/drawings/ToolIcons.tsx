import type { ReactNode } from 'react';

/**
 * Иконки инструментов, которых нет в lucide (спека 2026-11-17): тот же вид, что у
 * `FibIcon` — штрих 1.75 в поле 24×24, точки фигуры кружками.
 */
function Glyph({ size = 16, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const Dot = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={1.6} fill="currentColor" stroke="none" />;

type IconProps = { size?: number };

export const RegressionIcon = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M3 17L21 7" />
    <path d="M3 21L21 11M3 13L21 3" strokeWidth={1.25} strokeDasharray="2 2.5" />
  </Glyph>
);

export const PitchforkIcon = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M3 13L21 11M8 6L21 4M8 20L21 18M8 6L8 20" />
    <Dot x={3} y={13} />
  </Glyph>
);

export const FibExtIcon = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M11 4h10M11 9h10M11 14h10" />
    <path d="M3 20L8 8L11 16" strokeWidth={1.25} strokeDasharray="2 2.5" />
    <Dot x={3} y={20} />
    <Dot x={8} y={8} />
  </Glyph>
);

export const FibChannelIcon = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M3 12L15 3M5 16L19 6M7 20L21 10" />
  </Glyph>
);

export const FibFanIcon = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M3 20L21 4M3 20L21 9M3 20L21 14M3 20L21 18" />
    <Dot x={3} y={20} />
  </Glyph>
);

export const FibTimeIcon = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M3 3v18M6 3v18M9 3v18M14 3v18M21 3v18" />
  </Glyph>
);

export const GannFanIcon = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M3 21L8 3M3 21L14 3M3 21L21 3M3 21L21 10M3 21L21 16" strokeWidth={1.5} />
    <Dot x={3} y={21} />
  </Glyph>
);

export const ArcIcon = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M3 18Q12 2 21 18Z" />
  </Glyph>
);

export const XabcdIcon = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M2 18L7 6L11 13L16 4L22 17" />
    <path d="M2 18L11 13M11 13L22 17" strokeWidth={1.25} strokeDasharray="2 2.5" />
  </Glyph>
);

export const HeadShouldersIcon = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M2 18L6 10L9 15L12 4L15 15L18 10L22 18" />
    <path d="M7 15h12" strokeWidth={1.25} strokeDasharray="2 2.5" />
  </Glyph>
);

export const ElliottImpulseIcon = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M2 20L7 11L10 15L16 4L18 9L22 3" />
  </Glyph>
);

export const ElliottCorrectionIcon = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M3 5L10 16L14 10L21 20" />
  </Glyph>
);

export const CycleLinesIcon = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M4 3v18M10 3v18M16 3v18M22 3v18" />
    <path d="M4 12Q7 6 10 12Q13 6 16 12Q19 6 22 12" strokeWidth={1.25} />
  </Glyph>
);

export const VwapIcon = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M4 6v12M4 18C9 16 12 10 21 8" />
    <Dot x={4} y={18} />
  </Glyph>
);
