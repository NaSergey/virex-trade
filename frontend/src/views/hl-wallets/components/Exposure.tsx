import type { useTranslations } from 'next-intl';
import type { HlWalletRow } from '../api/hooks';

/**
 * Экспозиция позиций к балансу: нетто («+0.9×» — в лонге на 90 % баланса) цветом
 * стороны и брутто («плечо») приглушённо. Нейтральному кошельку — подпись: лонг
 * и шорт у него гасят друг друга, и «направление» по нему читать нечего.
 */
export function Exposure({ row, t }: { row: HlWalletRow; t: ReturnType<typeof useTranslations> }) {
  if (row.netExposure == null || row.grossExposure == null) return <span className="muted">—</span>;
  if (row.style === 'flat') return <span className="muted">{t('styleFlat')}</span>;
  const net = row.netExposure;
  return (
    <span title={t('exposureHint')}>
      <span className={net >= 0 ? 'pos' : 'neg'}>
        {net >= 0 ? '+' : '−'}
        {Math.abs(net).toFixed(2)}×
      </span>{' '}
      <span className="muted">
        · {row.grossExposure.toFixed(2)}×{row.style === 'neutral' ? ` · ${t('styleNeutral')}` : ''}
      </span>
    </span>
  );
}
