import { useTranslations } from 'next-intl';
import { formatX, historyTone } from '../lib/flight';

/** Точки краша последних раундов, новый — слева. */
export function History({ items }: { items: number[] }) {
  const t = useTranslations('jetpack');
  return (
    <ol className="jpg-history" aria-label={t('history')}>
      {items.map((x, i) => (
        <li key={i} className={`jpg-hx ${historyTone(x)} n`}>
          {formatX(x)}
        </li>
      ))}
    </ol>
  );
}
