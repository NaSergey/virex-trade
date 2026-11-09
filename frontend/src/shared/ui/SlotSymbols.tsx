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
  | 'scatter'
  | 'chest'
  | 'wheel';

/**
 * Рисунки символов слотов — один раз на страницу, `<symbol>` в скрытом SVG; клетки
 * барабанов (и карточка витрины) ссылаются на них `<use href="#sl-s-<имя>">`. Клеток в пуле
 * барабанов немного, но символ рисуется сложно (градиенты, блики, грани), и
 * держать его разметку в каждой клетке незачем.
 *
 * Набор — крипто (2026-11-09, для трейдеров): свечи «памп», монеты Ð, ₿ и
 * октаэдр, косые плашки, ракета, HODL, бриллиант («алмазные руки»), Луна (WILD),
 * аирдроп (скаттер). id остались прежними (`cherry` — свечи, `seven` — ₿ …):
 * сервер знает символы по ним, и правка картинки его не трогает.
 * Знаки — свои рисунки, не логотипы проектов.
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
  'chest',
  'wheel',
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

const WHEEL_COLORS = ['#e8173a', '#ffb81c', '#1b9bd8', '#2fbf4a', '#a42ad8', '#ff6a1f', '#e8173a', '#1b9bd8'];

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

        {/* ── Крипто-набор (2026-11-09): символы — то, чем живёт трейдер. Свет сверху слева,
             на тёмной ленте символ держит своё свечение (`sl-g-halo`). ── */}
        <radialGradient id="sl-g-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sl-g-up" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0a7a4a" />
          <stop offset="0.45" stopColor="#3dffb0" />
          <stop offset="1" stopColor="#0a8a52" />
        </linearGradient>
        <linearGradient id="sl-g-down" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8a0a22" />
          <stop offset="0.45" stopColor="#ff5a74" />
          <stop offset="1" stopColor="#8a0a22" />
        </linearGradient>
        <radialGradient id="sl-g-btc" cx="0.38" cy="0.32" r="0.72">
          <stop offset="0" stopColor="#ffe2b0" />
          <stop offset="0.35" stopColor="#ff9f1c" />
          <stop offset="0.85" stopColor="#c45f00" />
          <stop offset="1" stopColor="#5a2a00" />
        </radialGradient>
        <radialGradient id="sl-g-doge" cx="0.38" cy="0.32" r="0.72">
          <stop offset="0" stopColor="#fff6cf" />
          <stop offset="0.35" stopColor="#e8c24a" />
          <stop offset="0.85" stopColor="#a8851a" />
          <stop offset="1" stopColor="#4a3a00" />
        </radialGradient>
        <linearGradient id="sl-g-sol" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#9945ff" />
          <stop offset="1" stopColor="#14f1c6" />
        </linearGradient>
        <linearGradient id="sl-g-eth-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0f2ff" />
          <stop offset="1" stopColor="#9aa6ff" />
        </linearGradient>
        <linearGradient id="sl-g-eth-b" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7b86e8" />
          <stop offset="1" stopColor="#3a3f9a" />
        </linearGradient>
        <radialGradient id="sl-g-moon" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fffbe8" />
          <stop offset="0.6" stopColor="#e8dcb8" />
          <stop offset="1" stopColor="#8a7f62" />
        </radialGradient>
        <linearGradient id="sl-g-flame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6c8" />
          <stop offset="0.4" stopColor="#ffb02a" />
          <stop offset="1" stopColor="#ff3b1f" stopOpacity="0" />
        </linearGradient>

        {/* ── Свечи «памп»: красная, зелёная, зелёная выше ── */}
        <symbol id="sl-s-cherry" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="url(#sl-g-halo)" />
          <path d="M24 46 L24 82 M50 30 L50 84 M76 8 L76 70" stroke="#d8dde8" strokeWidth="2.4" />
          <rect x="16" y="54" width="16" height="22" rx="2" fill="url(#sl-g-down)" />
          <rect x="42" y="40" width="16" height="36" rx="2" fill="url(#sl-g-up)" />
          <rect x="68" y="16" width="16" height="46" rx="2" fill="url(#sl-g-up)" />
          <path d="M44 42 L44 72 M70 18 L70 58" stroke="#d0ffe9" strokeWidth="1.6" opacity="0.7" />
          <path d="M14 92 L86 92" stroke="#3dffb0" strokeWidth="1.2" opacity="0.4" />
        </symbol>

        {/* ── Ð — монета мемов ── */}
        <symbol id="sl-s-lemon" viewBox="0 0 100 100">
          <ellipse cx="50" cy="92" rx="30" ry="4" fill="url(#sl-g-drop)" />
          <circle cx="50" cy="50" r="40" fill="url(#sl-g-doge)" />
          <circle cx="50" cy="50" r="34" fill="none" stroke="#7a5a00" strokeWidth="2.2" />
          <text x="51" y="66" textAnchor="middle" fontFamily="Impact, 'Arial Black', system-ui, sans-serif" fontSize="46" fill="#5a4200" opacity="0.5">Ð</text>
          <text x="49" y="64" textAnchor="middle" fontFamily="Impact, 'Arial Black', system-ui, sans-serif" fontSize="46" fill="#fff6cf" stroke="#8a6a00" strokeWidth="1">Ð</text>
          <ellipse cx="36" cy="30" rx="12" ry="6" fill="url(#sl-g-shine)" transform="rotate(-35 36 30)" opacity="0.7" />
        </symbol>

        {/* ── Три косые плашки с переливом фиолетовый → бирюза ── */}
        <symbol id="sl-s-plum" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="url(#sl-g-halo)" />
          <path d="M26 24 L84 24 L74 36 L16 36 Z" fill="url(#sl-g-sol)" />
          <path d="M16 44 L74 44 L84 56 L26 56 Z" fill="url(#sl-g-sol)" />
          <path d="M26 64 L84 64 L74 76 L16 76 Z" fill="url(#sl-g-sol)" />
          <path d="M28 26 L80 26 M28 66 L80 66" stroke="#fff" strokeWidth="1.2" opacity="0.6" />
        </symbol>

        {/* ── Ракета «на Луну» ── */}
        <symbol id="sl-s-grapes" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="url(#sl-g-halo)" />
          <g transform="rotate(35 50 50)">
            <path d="M42 70 L58 70 L54 96 L46 96 Z" fill="url(#sl-g-flame)" />
            <path d="M50 6 C64 18 66 40 62 70 L38 70 C34 40 36 18 50 6 Z" fill="url(#sl-g-chrome)" stroke="#2a2e34" strokeWidth="1.2" />
            <path d="M38 52 L26 72 L38 70 Z M62 52 L74 72 L62 70 Z" fill="#ff3b5c" stroke="#5a0010" strokeWidth="1" />
            <circle cx="50" cy="34" r="7" fill="#14b8ff" stroke="#2a2e34" strokeWidth="2" />
            <circle cx="48" cy="32" r="2.4" fill="#fff" />
            <path d="M44 14 C42 24 42 40 43 60" stroke="#fff" strokeWidth="2" opacity="0.6" fill="none" />
          </g>
        </symbol>

        {/* ── Гранёный октаэдр ── */}
        <symbol id="sl-s-bell" viewBox="0 0 100 100">
          <ellipse cx="50" cy="94" rx="22" ry="3.5" fill="url(#sl-g-drop)" />
          <circle cx="50" cy="50" r="46" fill="url(#sl-g-halo)" />
          <polygon points="50,4 76,48 50,62" fill="url(#sl-g-eth-b)" />
          <polygon points="50,4 24,48 50,62" fill="url(#sl-g-eth-a)" />
          <polygon points="50,68 76,54 50,94" fill="url(#sl-g-eth-b)" />
          <polygon points="50,68 24,54 50,94" fill="url(#sl-g-eth-a)" />
          <polyline points="50,4 76,48 50,62 24,48 50,4" fill="none" stroke="#fff" strokeWidth="0.8" opacity="0.7" />
        </symbol>

        {/* ── HODL: плашка в хромовой рамке, неоновые буквы ── */}
        <symbol id="sl-s-bar" viewBox="0 0 100 100">
          <ellipse cx="50" cy="84" rx="40" ry="5" fill="url(#sl-g-drop)" />
          <rect x="6" y="28" width="88" height="46" rx="6" fill="url(#sl-g-chrome)" />
          <rect x="11" y="33" width="78" height="36" rx="3" fill="#06110c" />
          <text x="50" y="62" textAnchor="middle" fontFamily="Impact, 'Arial Black', system-ui, sans-serif" fontWeight="900" fontSize="27" letterSpacing="2" fill="#3dffb0" stroke="#0a5a3a" strokeWidth="0.8">HODL</text>
          <path d="M14 36 L86 36" stroke="#fff" strokeWidth="1.4" opacity="0.3" />
        </symbol>

        {/* ── ₿ — главная монета ── */}
        <symbol id="sl-s-seven" viewBox="0 0 100 100">
          <ellipse cx="50" cy="93" rx="32" ry="4" fill="url(#sl-g-drop)" />
          <circle cx="50" cy="50" r="42" fill="url(#sl-g-btc)" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="#7a3a00" strokeWidth="3" strokeDasharray="2 2.2" />
          <circle cx="50" cy="50" r="33" fill="none" stroke="#ffe2b0" strokeWidth="1.6" opacity="0.7" />
          <text x="52" y="69" textAnchor="middle" fontFamily="Impact, 'Arial Black', system-ui, sans-serif" fontSize="50" fill="#6a2a00" opacity="0.55" transform="rotate(14 52 50)">₿</text>
          <text x="50" y="67" textAnchor="middle" fontFamily="Impact, 'Arial Black', system-ui, sans-serif" fontSize="50" fill="#fff8ec" stroke="#a04a00" strokeWidth="1" transform="rotate(14 50 50)">₿</text>
          <ellipse cx="34" cy="28" rx="14" ry="7" fill="url(#sl-g-shine)" transform="rotate(-35 34 28)" opacity="0.75" />
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

        {/* ── WILD: Луна с лентой ── */}
        <symbol id="sl-s-wild" viewBox="0 0 100 100">
          <circle cx="50" cy="44" r="44" fill="url(#sl-g-halo)" />
          <circle cx="50" cy="42" r="34" fill="url(#sl-g-moon)" />
          <circle cx="38" cy="32" r="7" fill="#b8ad8c" opacity="0.6" />
          <circle cx="62" cy="48" r="9" fill="#b8ad8c" opacity="0.55" />
          <circle cx="44" cy="56" r="4" fill="#b8ad8c" opacity="0.6" />
          <circle cx="64" cy="28" r="3" fill="#b8ad8c" opacity="0.6" />
          <path d="M4 72 L96 72 L90 82 L96 92 L4 92 L10 82 Z" fill="#7a2ad8" stroke="#14f1c6" strokeWidth="2" />
          <text x="50" y="89" textAnchor="middle" fontFamily="Impact, 'Arial Black', system-ui, sans-serif" fontWeight="900" fontSize="18" letterSpacing="3" fill="#fff" stroke="#2a0050" strokeWidth="0.8">WILD</text>
        </symbol>

        {/* ── Скаттер: аирдроп — ящик на парашюте ── */}
        <symbol id="sl-s-scatter" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="url(#sl-g-halo)" />
          <path d="M12 40 C12 10 88 10 88 40 C80 34 72 34 64 40 C58 34 42 34 36 40 C28 34 20 34 12 40 Z" fill="url(#sl-g-sol)" stroke="#fff" strokeWidth="1" />
          <path d="M36 40 C42 30 58 30 64 40" fill="none" stroke="#fff" strokeWidth="1" opacity="0.5" />
          <path d="M14 40 L38 62 M36 40 L44 62 M64 40 L56 62 M86 40 L62 62" stroke="#d8dde8" strokeWidth="1.2" />
          <rect x="34" y="60" width="32" height="28" rx="2" fill="url(#sl-g-gold)" stroke="#5a3200" strokeWidth="1.2" />
          <path d="M34 74 L66 74 M50 60 L50 88" stroke="#5a3200" strokeWidth="2" />
          <text x="50" y="98" textAnchor="middle" fontFamily="Impact, 'Arial Black', system-ui, sans-serif" fontSize="9" letterSpacing="1.5" fill="#14f1c6">AIRDROP</text>
        </symbol>

        {/* ── Сундук: дерево с золотыми оковками, из щели — свет ── */}
        <linearGradient id="sl-g-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b5672a" />
          <stop offset="0.5" stopColor="#7a3a12" />
          <stop offset="1" stopColor="#3f1a06" />
        </linearGradient>
        <radialGradient id="sl-g-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6c8" />
          <stop offset="0.4" stopColor="#ffd34a" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ff9a1f" stopOpacity="0" />
        </radialGradient>
        <symbol id="sl-s-chest" viewBox="0 0 100 100">
          <ellipse cx="50" cy="90" rx="40" ry="5" fill="url(#sl-g-drop)" />
          <ellipse cx="50" cy="46" rx="40" ry="14" fill="url(#sl-g-glow)" />
          <path d="M12 46 L88 46 L86 86 L14 86 Z" fill="url(#sl-g-wood)" stroke="#2a1004" strokeWidth="1.4" />
          <path d="M12 46 C12 22 88 22 88 46 Z" fill="url(#sl-g-wood)" stroke="#2a1004" strokeWidth="1.4" />
          <path d="M18 40 C24 30 76 30 82 40" stroke="#d48a4a" strokeWidth="2" fill="none" opacity="0.6" />
          <rect x="12" y="44" width="76" height="6" fill="url(#sl-g-gold-h)" stroke="#5a3200" strokeWidth="0.8" />
          <path d="M24 28 L24 86 M76 28 L76 86" stroke="url(#sl-g-gold)" strokeWidth="6" />
          <rect x="12" y="80" width="76" height="6" fill="url(#sl-g-gold-h)" stroke="#5a3200" strokeWidth="0.8" />
          <rect x="41" y="44" width="18" height="20" rx="2" fill="url(#sl-g-gold)" stroke="#5a3200" strokeWidth="1" />
          <circle cx="50" cy="52" r="3" fill="#3a1600" />
          <path d="M50 54 L50 60" stroke="#3a1600" strokeWidth="2.4" />
          <path d="M30 44 L36 40 M64 40 L70 44 M46 42 L50 38 L54 42" stroke="#fff6c8" strokeWidth="1.6" opacity="0.9" />
          <ellipse cx="34" cy="32" rx="10" ry="4" fill="url(#sl-g-shine)" opacity="0.45" transform="rotate(-12 34 32)" />
        </symbol>

        {/* ── Колесо фортуны: цветные секторы, золотой обод, лампы ── */}
        <symbol id="sl-s-wheel" viewBox="0 0 100 100">
          <ellipse cx="50" cy="94" rx="30" ry="4" fill="url(#sl-g-drop)" />
          <circle cx="50" cy="50" r="44" fill="url(#sl-g-gold)" />
          <circle cx="50" cy="50" r="38" fill="#2a0612" />
          {WHEEL_COLORS.map((c, i) => {
            const a0 = (i * Math.PI * 2) / WHEEL_COLORS.length - Math.PI / 2;
            const a1 = ((i + 1) * Math.PI * 2) / WHEEL_COLORS.length - Math.PI / 2;
            const p = (a: number, r: number) => `${(50 + Math.cos(a) * r).toFixed(2)} ${(50 + Math.sin(a) * r).toFixed(2)}`;
            return <path key={i} d={`M50 50 L${p(a0, 36)} A36 36 0 0 1 ${p(a1, 36)} Z`} fill={c} stroke="#fff2b0" strokeWidth="0.8" />;
          })}
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI * 2) / 12;
            return <circle key={i} cx={50 + Math.cos(a) * 41} cy={50 + Math.sin(a) * 41} r="1.8" fill="#fffbe0" />;
          })}
          <circle cx="50" cy="50" r="9" fill="url(#sl-g-gold)" stroke="#5a3200" strokeWidth="1" />
          <circle cx="50" cy="50" r="3.4" fill="#ff2245" />
          <path d="M50 2 L58 14 L42 14 Z" fill="url(#sl-g-chrome)" stroke="#2a2e34" strokeWidth="1" />
          <ellipse cx="34" cy="28" rx="16" ry="7" fill="url(#sl-g-shine)" transform="rotate(-35 34 28)" opacity="0.35" />
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
