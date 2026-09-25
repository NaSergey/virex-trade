/**
 * Ракета джетпака — один рисунок на карточку витрины и на страницу игры: вью
 * не импортируют друг друга (тот же приём, что у мастей, `suits.tsx`).
 *
 * Система ракеты: хвост (центр среза корпуса) в нуле, нос вверх (y = −182),
 * x — поперёк оси; свет приходит слева. Пламя — от среза сопла (y = 24) назад
 * по оси. Свечение красится `--csn-4`/`--csn-5` родителя.
 *
 * id определений — с префиксом вызывающего: на странице могут стоять две
 * ракеты, и одинаковый id разрешался бы в первое определение документа.
 * Градиенты — `userSpaceOnUse` в системе ракеты: свет поворачивается с ней.
 */

type Pt = [x: number, y: number];

/**
 * Корпус: оживальный нос к острию, самое широкое место около иллюминатора,
 * к хвосту сужается. Полуширины сняты со снимка поперёк оси.
 */
const BODY = 'M-23 0 C-30 -30 -36 -70 -35 -100 C-34 -135 -18 -165 0 -182 C18 -165 34 -135 35 -100 C36 -70 30 -30 23 0 Q0 3 -23 0 Z';
/** Правый борт корпуса — по нему идёт фиолетовый контровой свет. */
const RIM = 'M23 0 C30 -30 36 -70 35 -100 C34 -135 18 -165 0 -182';

/**
 * Стабилизаторы стреловидные, остриём назад. Правый крупнее левого — это
 * ракурс снимка, а не разные детали.
 */
const FIN_L = 'M-34 -64 C-52 -44 -60 -8 -47 47 C-44 24 -36 4 -25 -4 Z';
const FIN_R = 'M35 -74 C64 -58 80 -12 49 38 C44 18 38 0 27 -8 Z';
/**
 * Симметричная пара — для ракеты, которая стоит на площадке прямо: ракурс
 * снимка там не к месту, и разные стабилизаторы читались кривой ракетой.
 * Размах — средний между левым и правым, кончики — на y = 44.
 */
const SYM_L = 'M-34 -70 C-56 -50 -68 -10 -52 44 C-47 22 -38 2 -26 -6 Z';
const SYM_R = 'M34 -70 C56 -50 68 -10 52 44 C47 22 38 2 26 -6 Z';
const fins = (symmetric?: boolean) => (symmetric ? [SYM_L, SYM_R] : [FIN_L, FIN_R]);
/**
 * Третий стабилизатор смотрит на зрителя ребром — узкая полоса вдоль оси.
 * Кончается выше среза сопла: заходя ниже, он ложился поверх начала факела,
 * и пламя читалось идущим из-за ракеты, а не из сопла.
 */
const FIN_C = 'M-5 -56 L-1 -50 L0 10 L-3 14 L-7 -48 Z';

/** Иллюминатор — чуть ближе к освещённому борту, как на снимке. */
const PORT: Pt = [-6, -108];

/**
 * Корпус в системе ракеты. Заливка по умолчанию — «нет» своей группой, а не
 * наследством от вызывающего: обводки корпуса, блик и контровой свет — пути
 * без `fill`, и в SVG без `fill="none"` (слой карточки его ставит, страница
 * игры — нет) они заливались чёрным поверх металла.
 */
export function RocketHull({ prefix, symmetric }: { prefix: string; symmetric?: boolean }) {
  const [finL, finR] = fins(symmetric);
  const url = (name: string) => `url(#${prefix}-${name})`;
  const [px, py] = PORT;
  const arc = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(px + r * Math.cos(a)).toFixed(2)} ${(py + r * Math.sin(a)).toFixed(2)}`;
  };
  return (
    <g fill="none">
      <defs>
        <clipPath id={`${prefix}-hull-clip`}>
          <path d={BODY} />
        </clipPath>
      </defs>

      {/* Боковые стабилизаторы — за корпусом. */}
      <path d={finL} fill={url('fin-l')} stroke="#e8e2ff" strokeOpacity="0.7" strokeWidth="1.2" />
      <path d={finR} stroke="var(--csn-4)" strokeWidth="4" opacity="0.6" filter={url('soft')} />
      <path d={finR} fill={url('fin-r')} stroke="var(--csn-5)" strokeOpacity="0.85" strokeWidth="1.3" />

      {/* Сопло: воротник, шейка, раструб. Срез раструба раскалён — пламя
          начинается в нём, а не где-то за корпусом. */}
      <path d="M-18 -2 L18 -2 L17 7 L-17 7 Z" fill={url('steel')} />
      <rect x="-12" y="7" width="24" height="4" fill="#15141b" />
      <path d="M-13 11 L13 11 L17 25 L-17 25 Z" fill={url('steel')} />
      <ellipse cx="0" cy="25" rx="17" ry="3" fill={url('mouth')} stroke="var(--csn-5)" strokeOpacity="0.7" strokeWidth="0.8" />
      <ellipse cx="0" cy="26" rx="12" ry="2.6" fill="#f6e8ff" filter={url('soft')} />

      {/* Корпус: свет поперёк оси и затемнение к хвосту. */}
      <path d={BODY} fill={url('hull')} />
      <g clipPath={url('hull-clip')}>
        <rect x="-40" y="-186" width="80" height="190" fill={url('hull-len')} />
        {/* Блик по освещённому борту и у острия носа. */}
        <path
          d="M-29 -12 C-33 -50 -33 -100 -27 -130 C-24 -146 -18 -158 -12 -166"
          stroke="#f6f2ff"
          strokeWidth="3.5"
          strokeLinecap="round"
          opacity="0.7"
          filter={url('blur')}
        />
        <ellipse cx="-7" cy="-160" rx="3" ry="11" fill="#ffffff" opacity="0.3" filter={url('blur')} />
        {/* Швы носового обтекателя и хвоста: тёмная линия и светлая под ней. */}
        <g fill="none">
          <path d="M-31 -133 Q0 -126 31 -136" stroke="#07070b" strokeWidth="1.6" />
          <path d="M-31 -131.6 Q0 -124.6 31 -134.6" stroke="#ffffff" strokeOpacity="0.16" strokeWidth="0.8" />
          <path d="M-27 -17 Q0 -11 28 -18" stroke="#07070b" strokeWidth="1.6" />
          <path d="M-27 -15.6 Q0 -9.6 28 -16.6" stroke="#ffffff" strokeOpacity="0.14" strokeWidth="0.8" />
        </g>
      </g>
      {/* Контровой свет пламени по правому борту. */}
      <path d={RIM} stroke="var(--csn-4)" strokeWidth="3.5" opacity="0.9" filter={url('blur')} />
      <path d={RIM} stroke="var(--csn-5)" strokeOpacity="0.8" strokeWidth="1" />
      <path d={BODY} stroke="#ece6ff" strokeOpacity="0.45" strokeWidth="1.1" />

      {/* Иллюминатор: металлическое кольцо, тёмное стекло, блик со стороны света. */}
      <circle cx={px} cy={py} r="19" fill={url('port-rim')} stroke="#0a0a0f" strokeWidth="1" />
      <circle cx={px} cy={py} r="16" fill={url('port-glass')} stroke="#000000" strokeWidth="1.2" />
      <path
        d={`M${arc(165, 12)} A12 12 0 0 1 ${arc(222, 12)}`}
        stroke="#ffffff"
        strokeOpacity="0.4"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      {/* Ребро переднего стабилизатора — поверх корпуса, со светлой кромкой. */}
      <path d={FIN_C} fill="#0e0d13" />
      <path d="M-7 -48 L-3 14" stroke="#f2eeff" strokeOpacity="0.9" strokeWidth="1.3" />
      <path d="M-1 -50 L0 10" stroke="#6a58a8" strokeOpacity="0.8" strokeWidth="0.9" />
    </g>
  );
}

/** Факел и ядро — в системе ракеты: от среза сопла (y = 24) назад по оси. */
const PLUME = 'M-17 24 C-31 80 -30 152 0 236 C30 152 31 80 17 24 Z';
const CORE = 'M-11 25 C-16 72 -10 126 0 182 C10 126 16 72 11 25 Z';
const WISPS = ['M-12 40 C-22 90 -30 130 -40 178', 'M11 44 C20 95 22 140 30 188'];

export { BODY as ROCKET_BODY, FIN_L as ROCKET_FIN_L, FIN_R as ROCKET_FIN_R };
export { PLUME as ROCKET_PLUME, CORE as ROCKET_CORE, WISPS as ROCKET_WISPS };

/**
 * Слои корабля вокруг корпуса — те же, что у карточки витрины: ореол по
 * силуэту, свечение пламени, факел и форсаж. Каждая часть — своя группа, чтобы
 * вызывающий положил её в свой HTML-слой (двигается слой, а не узел SVG).
 * `transform` ставит часть в кадр вызывающего; без него — система ракеты.
 */
type Part = { prefix: string; transform?: string; symmetric?: boolean };

/** Контровой ореол: ракета светится по силуэту от пламени и зарева. */
export function RocketHalo({ prefix, transform, symmetric }: Part) {
  const [finL, finR] = fins(symmetric);
  return (
    <g transform={transform} stroke="var(--csn-4)" strokeWidth="8" opacity="0.45" filter={`url(#${prefix}-glow)`}>
      <path d={BODY} />
      <path d={finL} />
      <path d={finR} />
    </g>
  );
}

/** Свечение пламени — размытые слои под факелом; дышит слой, а не рисунок. */
export function FlameGlow({ prefix, transform }: Part) {
  const url = (name: string) => `url(#${prefix}-${name})`;
  return (
    <g transform={transform}>
      <ellipse cx="0" cy="140" rx="50" ry="110" fill="var(--csn-3)" opacity="0.5" filter={url('plume')} />
      <path d="M-28 24 C-54 100 -42 190 0 270 C42 190 54 100 28 24 Z" fill="#6a2cff" opacity="0.5" filter={url('plume')} />
      <path d="M-22 24 C-44 90 -36 170 0 252 C36 170 44 90 22 24 Z" fill="var(--csn-4)" opacity="0.75" filter={url('plume')} />
      {/* Вспышка у среза сопла — самое яркое место кадра. */}
      <ellipse cx="0" cy="42" rx="20" ry="20" fill="#ead6ff" opacity="0.55" filter={url('plume')} />
    </g>
  );
}

/** Факел с ядром и струйками. */
export function FlamePlume({ prefix, transform }: Part) {
  const url = (name: string) => `url(#${prefix}-${name})`;
  return (
    <g transform={transform}>
      <path d={PLUME} fill={url('plume-fill')} filter={url('soft')} />
      <path d={CORE} fill={url('core')} filter={url('blur')} />
      <g stroke="#ecd8ff" strokeWidth="1.1" opacity="0.6" fill="none">
        {WISPS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </g>
  );
}

/** Форсаж — длиннее и белее; загорается прозрачностью своего слоя. */
export function FlameBoost({ prefix, transform }: Part) {
  const url = (name: string) => `url(#${prefix}-${name})`;
  return (
    <g transform={transform}>
      <path d="M-24 24 C-48 100 -38 190 0 280 C38 190 48 100 24 24 Z" fill="var(--csn-4)" opacity="0.7" filter={url('plume')} />
      <path d={CORE} fill="#ffffff" opacity="0.85" filter={url('soft')} />
      <ellipse cx="0" cy="40" rx="20" ry="20" fill="#ffffff" opacity="0.6" filter={url('plume')} />
    </g>
  );
}

/**
 * Определения ракеты и пламени — фрагмент без своей `<defs>`: вызывающий
 * кладёт его внутрь своей. Фильтры `blur`/`soft`/`plume`/`glow` здесь же, потому что
 * без них рисунок не собрать; сцена, которой они нужны для другого, берёт их
 * по тому же префиксу.
 */
export function RocketDefs({ prefix }: { prefix: string }) {
  const id = (name: string) => `${prefix}-${name}`;
  return (
    <>
      <filter id={id('blur')} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.4" />
      </filter>
      <filter id={id('soft')} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2.5" />
      </filter>
      <filter id={id('plume')} x="-80%" y="-30%" width="260%" height="160%">
        <feGaussianBlur stdDeviation="12" />
      </filter>
      <filter id={id('glow')} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" />
      </filter>
      <linearGradient id={id('hull')} gradientUnits="userSpaceOnUse" x1="-36" y1="0" x2="36" y2="0">
        <stop offset="0" stopColor="#3a3846" />
        <stop offset="0.07" stopColor="#dcd8ea" />
        <stop offset="0.17" stopColor="#8e8aa0" />
        <stop offset="0.34" stopColor="#3a3846" />
        <stop offset="0.56" stopColor="#15141c" />
        <stop offset="0.8" stopColor="#0e0b1c" />
        <stop offset="0.93" stopColor="#3a2a78" />
        <stop offset="1" stopColor="#9a74ff" />
      </linearGradient>
      <linearGradient id={id('hull-len')} gradientUnits="userSpaceOnUse" x1="0" y1="-182" x2="0" y2="0">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.14" />
        <stop offset="0.45" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="1" stopColor="#000000" stopOpacity="0.45" />
      </linearGradient>
      <linearGradient id={id('fin-l')} gradientUnits="userSpaceOnUse" x1="-56" y1="-30" x2="-26" y2="0">
        <stop offset="0" stopColor="#4a4756" />
        <stop offset="1" stopColor="#0b0a10" />
      </linearGradient>
      <linearGradient id={id('fin-r')} gradientUnits="userSpaceOnUse" x1="30" y1="-20" x2="72" y2="0">
        <stop offset="0" stopColor="#0b0a10" />
        <stop offset="1" stopColor="#1d1540" />
      </linearGradient>
      <linearGradient id={id('steel')} gradientUnits="userSpaceOnUse" x1="-19" y1="0" x2="19" y2="0">
        <stop offset="0" stopColor="#3a3844" />
        <stop offset="0.25" stopColor="#cfcbdc" />
        <stop offset="0.5" stopColor="#6c6878" />
        <stop offset="0.8" stopColor="#1a1920" />
        <stop offset="1" stopColor="#4b3a8a" />
      </linearGradient>
      <radialGradient id={id('mouth')} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.55" stopColor="#eed9ff" />
        <stop offset="1" stopColor="#9a6cff" />
      </radialGradient>
      <radialGradient id={id('port-rim')} cx="0.32" cy="0.5" r="0.75">
        <stop offset="0" stopColor="#d9d5e4" />
        <stop offset="0.6" stopColor="#4a4756" />
        <stop offset="1" stopColor="#101016" />
      </radialGradient>
      <radialGradient id={id('port-glass')} cx="0.38" cy="0.48" r="0.7">
        <stop offset="0" stopColor="#262036" />
        <stop offset="0.7" stopColor="#0b0a12" />
        <stop offset="1" stopColor="#050408" />
      </radialGradient>

      <linearGradient id={id('plume-fill')} gradientUnits="userSpaceOnUse" x1="0" y1="22" x2="0" y2="236">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.22" stopColor="#f0c8ff" />
        <stop offset="0.5" stopColor="#b07cff" stopOpacity="0.85" />
        <stop offset="1" stopColor="#6a3be0" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={id('core')} gradientUnits="userSpaceOnUse" x1="0" y1="24" x2="0" y2="176">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.6" stopColor="#fbeaff" />
        <stop offset="1" stopColor="#e3b3ff" stopOpacity="0" />
      </linearGradient>
    </>
  );
}
