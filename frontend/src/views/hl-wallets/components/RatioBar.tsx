import { useTranslations } from 'next-intl';

/**
 * Соотношение лонгов и шортов полосой: зелёный отрезок — лонги, красный —
 * шорты, длина — по числу кошельков, число — внутри отрезка. Все в одну
 * сторону — полоса одного цвета во всю ширину.
 */
export function RatioBar({ longs, shorts }: { longs: number; shorts: number }) {
  const t = useTranslations('hlWallets');
  return (
    <div className="hl-ratio" role="img" aria-label={t('longShort', { longs, shorts })}>
      {longs > 0 ? (
        <i className="long" style={{ flexGrow: longs }}>
          {longs}
        </i>
      ) : null}
      {shorts > 0 ? (
        <i className="short" style={{ flexGrow: shorts }}>
          {shorts}
        </i>
      ) : null}
    </div>
  );
}
