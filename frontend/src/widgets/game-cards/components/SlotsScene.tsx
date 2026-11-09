import { SlotDefs, symHref, type SlotSymbol } from '@/shared/ui/SlotSymbols';

/**
 * Сцена слотов на витрине: три барабана в окне автомата крутятся и встают на
 * «777», лампы вывески бегут, под курсором — быстрее и с монетами.
 *
 * Лента каждого барабана — HTML-слой с готовыми символами, двигается
 * `transform` (правило сцен витрины: внутри SVG ничего не анимируется).
 * Первый и последний символ ленты — семёрка, поэтому конец цикла совпадает
 * с началом, и шва нет; под reduced-motion сцена стоит на «777».
 */
const STRIPS: SlotSymbol[][] = [
  ['seven', 'cherry', 'bar', 'lemon', 'diamond', 'plum', 'bell', 'grapes', 'seven'],
  ['seven', 'plum', 'bell', 'cherry', 'wild', 'lemon', 'bar', 'diamond', 'seven'],
  ['seven', 'grapes', 'diamond', 'bar', 'cherry', 'scatter', 'lemon', 'bell', 'seven'],
];

export function SlotsScene() {
  return (
    <div className="gscene slsc" aria-hidden>
      <SlotDefs />
      <div className="slsc-glow" />
      <div className="slsc-cab">
        <div className="slsc-lamps">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} style={{ ['--i' as string]: i }} />
          ))}
        </div>
        <div className="slsc-win">
          {STRIPS.map((strip, r) => (
            <div key={r} className="slsc-reel">
              <div className={`slsc-strip slsc-strip-${r}`}>
                {strip.map((s, k) => (
                  <svg key={k} viewBox="0 0 100 100">
                    <use href={symHref(s)} />
                  </svg>
                ))}
              </div>
            </div>
          ))}
          <div className="slsc-line" />
        </div>
      </div>
      <div className="slsc-coins">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} style={{ ['--i' as string]: i }} />
        ))}
      </div>
    </div>
  );
}
