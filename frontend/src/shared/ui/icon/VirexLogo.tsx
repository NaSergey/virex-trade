import type { SVGProps } from "react";

// 5 candle paths split from original compound path.
// Absolute M coordinates derived from relative m offsets between subpaths.
// Cycle = 10s total. Motion occupies first 2s (keyTimes 0→0.1→0.2), then holds at rest.
const CANDLES: { d: string; amp: number; delay: string }[] = [
  {
    // far left
    d: "M1700 5376 l0 -415 45 -37 45 -36 0 -802 0 -802 -45 -32 -45 -32 0 -795 0 -795 -55 0 -55 0 0 791 0 791 -31 28 c-16 16 -39 32 -50 35 -19 6 -19 22 -19 810 l0 804 44 30 c24 17 46 38 50 46 3 9 6 199 6 421 l0 404 55 0 55 0 0 -414z",
    amp: 500,
    delay: "0s",
  },
  {
    // left of center
    d: "M2730 5371 l0 -1159 33 -26 c17 -15 38 -31 45 -37 9 -8 12 -176 12 -779 0 -467 -4 -770 -9 -770 -5 0 -26 -15 -45 -34 l-36 -33 0 -827 0 -826 -55 0 -55 0 0 824 c0 803 0 824 -20 848 -10 14 -33 31 -50 38 l-30 12 0 768 0 768 50 36 50 36 0 1160 0 1160 55 0 55 0 0 -1159z",
    amp: 650,
    delay: "0.2s",
  },
  {
    // center (tallest)
    d: "M3763 6103 l-2 -1128 50 -46 49 -45 0 -1531 0 -1530 -39 -26 c-21 -14 -43 -39 -49 -55 -7 -20 -10 -288 -9 -796 l2 -766 -52 0 -53 0 0 778 c0 859 5 799 -65 842 l-35 22 0 1532 0 1533 50 42 50 42 0 1130 0 1129 53 0 52 0 -2 -1127z",
    amp: 800,
    delay: "0.4s",
  },
  {
    // right of center
    d: "M4800 6121 c0 -225 3 -417 6 -426 4 -8 26 -29 50 -46 l44 -30 0 -799 c0 -783 0 -799 -19 -805 -11 -3 -34 -19 -50 -35 l-31 -28 0 -1536 0 -1536 -55 0 -55 0 0 1540 0 1540 -50 36 -50 36 0 794 0 794 40 25 c21 13 44 33 50 44 6 13 10 164 10 430 l0 411 55 0 55 0 0 -409z",
    amp: 600,
    delay: "0.6s",
  },
  {
    // far right
    d: "M5830 5384 c0 -262 4 -412 10 -425 6 -11 29 -31 50 -44 l40 -25 0 -799 0 -799 -50 -36 -50 -36 0 -795 0 -795 -55 0 -55 0 0 786 c0 490 -4 792 -10 804 -5 10 -25 27 -45 39 l-35 20 0 804 0 803 45 37 45 38 0 414 0 415 55 0 55 0 0 -406z",
    amp: 550,
    delay: "0.8s",
  },
];

export function VirexLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 742 742"
      fill="currentColor"
      aria-label="Virex"
      {...props}
    >
      <g transform="translate(0,742) scale(0.1, -0.1)">
        {CANDLES.map(({ d, amp, delay }, i) => (
          <path key={i} d={d}>
            {/* 10s cycle: motion in first 2s (0→10%→20%), holds at rest for 8s */}
            <animateTransform
              attributeName="transform"
              type="translate"
              values={`0 0; 0 ${amp}; 0 0; 0 0`}
              dur="10s"
              begin={delay}
              repeatCount="indefinite"
              keyTimes="0;0.1;0.2;1"
              keySplines="0.45 0.05 0.55 0.95;0.45 0.05 0.55 0.95;0 0 1 1"
              calcMode="spline"
              additive="sum"
            />
          </path>
        ))}
      </g>
    </svg>
  );
}
