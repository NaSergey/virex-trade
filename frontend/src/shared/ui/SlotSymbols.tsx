/** Символы слотов. Тип живёт здесь, а не в `entities/slots`: рисунки нужны и карточке витрины. */
export type SlotSymbol =
  | 'cherry'
  | 'lemon'
  | 'plum'
  | 'grapes'
  | 'bell'
  | 'bar'
  | 'seven'
  | 'diamond'
  | 'wild'
  | 'scatter';

/**
 * Рисунки символов слотов — один раз на страницу, `<symbol>` в скрытом SVG; клетки
 * барабанов (и карточка витрины) ссылаются на них `<use href="#sl-s-<имя>">`. Клеток в пуле
 * барабанов немного, но символ рисуется сложно (градиенты, блики, грани), и
 * держать его разметку в каждой клетке незачем.
 *
 * Свет у всех символов один — сверху слева: блик там, тень справа снизу.
 * Разный свет у соседних символов читался бы коллажем, а не одной лентой.
 *
 * У каждого символа есть размытый двойник (`#sl-b-<имя>`) — его клетка
 * показывает на полной скорости барабана: размытие вдоль хода, как у снимка
 * настоящей ленты с выдержкой. Клетка с ним растрируется один раз: двигается
 * она `transform`, а не перерисовкой.
 *
 * Скрытый SVG — нулевого размера, а не `display: none`: градиенты из
 * невидимого SVG часть браузеров не находит, и символы выходили бы чёрными.
 */
export const SYMBOL_IDS: readonly SlotSymbol[] = [
  'cherry',
  'lemon',
  'plum',
  'grapes',
  'bell',
  'bar',
  'seven',
  'diamond',
  'wild',
  'scatter',
];

export const symHref = (s: SlotSymbol, blur = false) => `#sl-${blur ? 'b' : 's'}-${s}`;

/** Сфера: блик сверху слева, тёмный край — общая для вишни, сливы и винограда. */
function Sphere({ id, light, mid, dark }: { id: string; light: string; mid: string; dark: string }) {
  return (
    <radialGradient id={id} cx="0.36" cy="0.32" r="0.72">
      <stop offset="0" stopColor={light} />
      <stop offset="0.38" stopColor={mid} />
      <stop offset="0.86" stopColor={dark} />
      <stop offset="1" stopColor="#120006" />
    </radialGradient>
  );
}

const GRAPES: [number, number, number][] = [
  [38, 40, 11],
  [60, 40, 11],
  [27, 55, 11],
  [49, 55, 11.5],
  [71, 55, 11],
  [37, 70, 11],
  [60, 70, 11],
  [48, 84, 10.5],
];

export function SlotDefs() {
  return (
    <svg className="sl-defs" width="0" height="0" style={{ position: 'absolute', overflow: 'hidden' }} aria-hidden focusable="false">
      <defs>
        {/* Размытие вдоль хода барабана: по вертикали, по горизонтали ноль. */}
        <filter id="sl-mblur" x="-10%" y="-40%" width="120%" height="180%">
          <feGaussianBlur stdDeviation="0 7" />
        </filter>
        <filter id="sl-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>

        <Sphere id="sl-g-cherry" light="#ffd2d6" mid="#e2102c" dark="#7a0414" />
        <Sphere id="sl-g-plum" light="#f2d9ff" mid="#7e2bb8" dark="#33074f" />
        <Sphere id="sl-g-grape" light="#f4ffd0" mid="#7fc236" dark="#2d5a0d" />
        <radialGradient id="sl-g-lemon" cx="0.38" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fffbe0" />
          <stop offset="0.35" stopColor="#ffe23a" />
          <stop offset="0.8" stopColor="#e2a800" />
          <stop offset="1" stopColor="#7d5200" />
        </radialGradient>
        <linearGradient id="sl-g-stem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9be05a" />
          <stop offset="1" stopColor="#2f6a12" />
        </linearGradient>
        <linearGradient id="sl-g-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b5f06b" />
          <stop offset="0.5" stopColor="#4caa21" />
          <stop offset="1" stopColor="#1d520a" />
        </linearGradient>
        {/* Золото: полосы света и тени поперёк — металл, а не жёлтая заливка. */}
        <linearGradient id="sl-g-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6c8" />
          <stop offset="0.18" stopColor="#ffd75a" />
          <stop offset="0.42" stopColor="#c98a0c" />
          <stop offset="0.55" stopColor="#ffe48a" />
          <stop offset="0.78" stopColor="#b8730a" />
          <stop offset="1" stopColor="#6b3d00" />
        </linearGradient>
        <linearGradient id="sl-g-gold-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7a4a00" />
          <stop offset="0.25" stopColor="#ffe48a" />
          <stop offset="0.5" stopColor="#c98a0c" />
          <stop offset="0.75" stopColor="#fff2b0" />
          <stop offset="1" stopColor="#8a5600" />
        </linearGradient>
        <linearGradient id="sl-g-chrome" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.3" stopColor="#c9ced6" />
          <stop offset="0.5" stopColor="#5e6670" />
          <stop offset="0.52" stopColor="#d7dce2" />
          <stop offset="1" stopColor="#3a4048" />
        </linearGradient>
        <linearGradient id="sl-g-red7" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8a8a" />
          <stop offset="0.3" stopColor="#ff1a2e" />
          <stop offset="0.7" stopColor="#b3001a" />
          <stop offset="1" stopColor="#5c000c" />
        </linearGradient>
        <linearGradient id="sl-g-bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3a44" />
          <stop offset="0.5" stopColor="#0d0d12" />
          <stop offset="1" stopColor="#24242c" />
        </linearGradient>
        <linearGradient id="sl-g-gem-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#7fe3ff" />
        </linearGradient>
        <linearGradient id="sl-g-gem-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#41c8ff" />
          <stop offset="1" stopColor="#0a4fb5" />
        </linearGradient>
        <linearGradient id="sl-g-gem-c" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d7fe0" />
          <stop offset="1" stopColor="#062a6b" />
        </linearGradient>
        <radialGradient id="sl-g-wild" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#ff7ad9" />
          <stop offset="0.6" stopColor="#9c1fd6" />
          <stop offset="1" stopColor="#3c0663" />
        </radialGradient>
        <radialGradient id="sl-g-coin" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fff7cf" />
          <stop offset="0.35" stopColor="#ffd34a" />
          <stop offset="0.8" stopColor="#c47f00" />
          <stop offset="1" stopColor="#6d3f00" />
        </radialGradient>
        <radialGradient id="sl-g-shine" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sl-g-drop" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.38" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>

        {/* ── Вишня ── */}
        <symbol id="sl-s-cherry" viewBox="0 0 100 100">
          <ellipse cx="50" cy="90" rx="34" ry="5" fill="url(#sl-g-drop)" />
          <path d="M33 62 C38 40 50 24 66 14" stroke="url(#sl-g-stem)" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M68 60 C66 42 66 28 66 14" stroke="url(#sl-g-stem)" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M66 15 C76 6 92 10 94 20 C84 26 72 24 66 15 Z" fill="url(#sl-g-leaf)" />
          <path d="M67 15 C76 15 85 17 92 20" stroke="#1d520a" strokeWidth="1" fill="none" opacity="0.7" />
          <circle cx="32" cy="70" r="20" fill="url(#sl-g-cherry)" />
          <circle cx="68" cy="68" r="20" fill="url(#sl-g-cherry)" />
          <path d="M28 52 Q32 56 36 52" stroke="#5a0010" strokeWidth="2" fill="none" />
          <path d="M64 50 Q68 54 72 50" stroke="#5a0010" strokeWidth="2" fill="none" />
          <ellipse cx="25" cy="62" rx="6" ry="4" fill="url(#sl-g-shine)" transform="rotate(-30 25 62)" />
          <ellipse cx="61" cy="60" rx="6" ry="4" fill="url(#sl-g-shine)" transform="rotate(-30 61 60)" />
          <path d="M18 80 Q26 88 38 86" stroke="#ff8a96" strokeWidth="1.6" fill="none" opacity="0.6" />
          <path d="M54 78 Q62 86 74 84" stroke="#ff8a96" strokeWidth="1.6" fill="none" opacity="0.6" />
        </symbol>

        {/* ── Лимон ── */}
        <symbol id="sl-s-lemon" viewBox="0 0 100 100">
          <ellipse cx="50" cy="88" rx="36" ry="5" fill="url(#sl-g-drop)" />
          <path
            d="M8 52 C14 46 18 30 38 24 C56 19 76 24 86 38 C90 44 92 48 95 52 C90 56 89 62 84 68 C72 82 50 84 32 78 C18 72 14 58 8 52 Z"
            fill="url(#sl-g-lemon)"
            stroke="#8a5a00"
            strokeWidth="1.2"
          />
          <ellipse cx="40" cy="38" rx="16" ry="7" fill="url(#sl-g-shine)" transform="rotate(-12 40 38)" opacity="0.85" />
          <g fill="#b07800" opacity="0.35">
            <circle cx="56" cy="48" r="1" />
            <circle cx="64" cy="58" r="1" />
            <circle cx="48" cy="62" r="1" />
            <circle cx="72" cy="46" r="1" />
            <circle cx="38" cy="56" r="1" />
            <circle cx="60" cy="68" r="1" />
            <circle cx="76" cy="60" r="1" />
          </g>
          <path d="M86 38 C90 30 96 28 98 32" stroke="url(#sl-g-stem)" strokeWidth="3" fill="none" strokeLinecap="round" />
        </symbol>

        {/* ── Слива: налёт — светлая дымка поверх сферы ── */}
        <symbol id="sl-s-plum" viewBox="0 0 100 100">
          <ellipse cx="50" cy="90" rx="32" ry="5" fill="url(#sl-g-drop)" />
          <ellipse cx="50" cy="56" rx="34" ry="32" fill="url(#sl-g-plum)" />
          <path d="M50 26 C44 40 44 70 52 88" stroke="#26043d" strokeWidth="2.2" fill="none" opacity="0.7" />
          <ellipse cx="50" cy="56" rx="34" ry="32" fill="#e8d4ff" opacity="0.14" />
          <ellipse cx="36" cy="40" rx="10" ry="6" fill="url(#sl-g-shine)" transform="rotate(-28 36 40)" />
          <path d="M50 26 C50 18 54 12 58 10" stroke="#5a3a12" strokeWidth="3.4" fill="none" strokeLinecap="round" />
          <path d="M57 13 C66 6 80 10 82 18 C72 22 62 20 57 13 Z" fill="url(#sl-g-leaf)" />
        </symbol>

        {/* ── Виноград ── */}
        <symbol id="sl-s-grapes" viewBox="0 0 100 100">
          <ellipse cx="50" cy="94" rx="26" ry="4" fill="url(#sl-g-drop)" />
          <path d="M50 30 C50 22 52 14 56 8" stroke="#5a3a12" strokeWidth="3.4" fill="none" strokeLinecap="round" />
          <path d="M52 22 C40 8 20 12 18 22 C30 30 44 30 52 22 Z" fill="url(#sl-g-leaf)" />
          <path d="M52 22 C40 20 28 20 20 22" stroke="#1d520a" strokeWidth="1" fill="none" />
          {GRAPES.map(([x, y, r], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r={r} fill="url(#sl-g-grape)" stroke="#204508" strokeWidth="0.6" />
              <ellipse cx={x - r * 0.35} cy={y - r * 0.4} rx={r * 0.32} ry={r * 0.22} fill="#fff" opacity="0.75" />
            </g>
          ))}
        </symbol>

        {/* ── Колокол ── */}
        <symbol id="sl-s-bell" viewBox="0 0 100 100">
          <ellipse cx="50" cy="90" rx="36" ry="5" fill="url(#sl-g-drop)" />
          <circle cx="50" cy="14" r="6" fill="none" stroke="url(#sl-g-gold-h)" strokeWidth="4" />
          <path
            d="M50 18 C30 18 26 36 25 52 C24 64 20 70 12 76 L88 76 C80 70 76 64 75 52 C74 36 70 18 50 18 Z"
            fill="url(#sl-g-gold-h)"
            stroke="#6b3d00"
            strokeWidth="1.4"
          />
          <path d="M10 76 L90 76 Q92 84 84 84 L16 84 Q8 84 10 76 Z" fill="url(#sl-g-gold)" stroke="#6b3d00" strokeWidth="1.2" />
          <circle cx="50" cy="88" r="7" fill="url(#sl-g-gold)" stroke="#6b3d00" strokeWidth="1" />
          <path d="M36 28 C32 38 31 52 30 66" stroke="#fffbe0" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.8" />
          <path d="M30 60 L70 60" stroke="#8a5600" strokeWidth="1.6" opacity="0.5" />
        </symbol>

        {/* ── BAR: чёрная плашка в хромовой рамке, золотые буквы ── */}
        <symbol id="sl-s-bar" viewBox="0 0 100 100">
          <ellipse cx="50" cy="84" rx="40" ry="5" fill="url(#sl-g-drop)" />
          <rect x="6" y="28" width="88" height="46" rx="6" fill="url(#sl-g-chrome)" />
          <rect x="11" y="33" width="78" height="36" rx="3" fill="url(#sl-g-bar)" />
          <text
            x="50"
            y="63"
            textAnchor="middle"
            fontFamily="Impact, 'Arial Black', system-ui, sans-serif"
            fontWeight="900"
            fontSize="31"
            letterSpacing="2"
            fill="url(#sl-g-gold)"
            stroke="#3d2200"
            strokeWidth="1"
          >
            BAR
          </text>
          <path d="M14 36 L86 36" stroke="#fff" strokeWidth="1.4" opacity="0.35" />
        </symbol>

        {/* ── Семёрка: рельеф — тёмная копия со сдвигом под лицом ── */}
        <symbol id="sl-s-seven" viewBox="0 0 100 100">
          <ellipse cx="50" cy="92" rx="30" ry="5" fill="url(#sl-g-drop)" />
          <path d="M22 16 L82 16 L82 28 C64 46 54 66 50 90 L30 90 C34 66 46 46 60 30 L22 30 Z" fill="#3a0006" transform="translate(3 4)" />
          <path
            d="M22 16 L82 16 L82 28 C64 46 54 66 50 90 L30 90 C34 66 46 46 60 30 L22 30 Z"
            fill="url(#sl-g-red7)"
            stroke="url(#sl-g-gold)"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path d="M26 20 L78 20" stroke="#ffd0d0" strokeWidth="2.4" opacity="0.8" strokeLinecap="round" />
          <path d="M56 36 C48 48 42 62 38 80" stroke="#ffb0b0" strokeWidth="2.4" opacity="0.5" fill="none" strokeLinecap="round" />
        </symbol>

        {/* ── Бриллиант: грани разным тоном, блик-звезда ── */}
        <symbol id="sl-s-diamond" viewBox="0 0 100 100">
          <ellipse cx="50" cy="94" rx="26" ry="4" fill="url(#sl-g-drop)" />
          <polygon points="26,20 74,20 94,40 50,92 6,40" fill="url(#sl-g-gem-c)" />
          <polygon points="26,20 50,20 38,40 6,40" fill="url(#sl-g-gem-a)" />
          <polygon points="50,20 74,20 62,40 38,40" fill="#bdf2ff" />
          <polygon points="74,20 94,40 62,40" fill="url(#sl-g-gem-b)" />
          <polygon points="6,40 38,40 50,92" fill="url(#sl-g-gem-b)" />
          <polygon points="38,40 62,40 50,92" fill="#6fd6ff" />
          <polygon points="62,40 94,40 50,92" fill="url(#sl-g-gem-c)" />
          <polyline points="26,20 74,20 94,40 50,92 6,40 26,20" fill="none" stroke="#e8fbff" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M6 40 L94 40" stroke="#e8fbff" strokeWidth="0.8" opacity="0.7" />
          <path d="M30 10 L32 18 L40 20 L32 22 L30 30 L28 22 L20 20 L28 18 Z" fill="#fff" />
          <circle cx="30" cy="20" r="6" fill="url(#sl-g-shine)" />
        </symbol>

        {/* ── WILD: звезда-медаль с лентой ── */}
        <symbol id="sl-s-wild" viewBox="0 0 100 100">
          <circle cx="50" cy="44" r="40" fill="url(#sl-g-wild)" stroke="url(#sl-g-gold)" strokeWidth="5" />
          <path
            d="M50 12 L59 34 L82 35 L64 50 L70 73 L50 60 L30 73 L36 50 L18 35 L41 34 Z"
            fill="url(#sl-g-gold)"
            stroke="#5a3200"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path d="M50 16 L56 34" stroke="#fffbe0" strokeWidth="2" opacity="0.8" />
          <path d="M4 72 L96 72 L90 82 L96 92 L4 92 L10 82 Z" fill="#c4122e" stroke="url(#sl-g-gold)" strokeWidth="2" />
          <text
            x="50"
            y="89"
            textAnchor="middle"
            fontFamily="Impact, 'Arial Black', system-ui, sans-serif"
            fontWeight="900"
            fontSize="18"
            letterSpacing="3"
            fill="url(#sl-g-gold)"
            stroke="#4a0008"
            strokeWidth="0.8"
          >
            WILD
          </text>
          <ellipse cx="36" cy="24" rx="12" ry="6" fill="url(#sl-g-shine)" transform="rotate(-30 36 24)" opacity="0.5" />
        </symbol>

        {/* ── Скаттер: золотая монета с короной, рифлёный край ── */}
        <symbol id="sl-s-scatter" viewBox="0 0 100 100">
          <ellipse cx="50" cy="94" rx="30" ry="4" fill="url(#sl-g-drop)" />
          <circle cx="50" cy="50" r="42" fill="url(#sl-g-coin)" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="#7a4a00" strokeWidth="4" strokeDasharray="2 2.2" />
          <circle cx="50" cy="50" r="33" fill="none" stroke="url(#sl-g-gold-h)" strokeWidth="2.4" />
          <path
            d="M28 60 L24 34 L38 46 L50 28 L62 46 L76 34 L72 60 Z"
            fill="url(#sl-g-gold)"
            stroke="#5a3200"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <rect x="28" y="61" width="44" height="7" fill="url(#sl-g-gold-h)" stroke="#5a3200" strokeWidth="1" />
          <circle cx="50" cy="44" r="3.4" fill="#ff2245" />
          <circle cx="36" cy="52" r="2.4" fill="#2bd0ff" />
          <circle cx="64" cy="52" r="2.4" fill="#2bd0ff" />
          <text
            x="50"
            y="82"
            textAnchor="middle"
            fontFamily="Impact, 'Arial Black', system-ui, sans-serif"
            fontSize="10"
            letterSpacing="2"
            fill="#5a3200"
          >
            BONUS
          </text>
          <ellipse cx="34" cy="28" rx="14" ry="7" fill="url(#sl-g-shine)" transform="rotate(-35 34 28)" opacity="0.7" />
        </symbol>

        {SYMBOL_IDS.map((s) => (
          <symbol key={s} id={`sl-b-${s}`} viewBox="0 0 100 100">
            <use href={`#sl-s-${s}`} filter="url(#sl-mblur)" />
          </symbol>
        ))}
      </defs>
    </svg>
  );
}
