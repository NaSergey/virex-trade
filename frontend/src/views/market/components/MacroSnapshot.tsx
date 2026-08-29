'use client';

import { useTranslations } from 'next-intl';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Tooltip } from '@/shared/ui/Tooltip';
import { useLocaleControl } from '@/shared/i18n';
import { fmtPctSigned } from '@/shared/lib/utils/format';
import { fmtUsdCompact } from './SentimentChart';
import { fearGreedLabel } from '../lib/fearGreedLabel';
import type { MarketData, FearGreedData, DeFiTVLData, Cmc20Data } from '../api/hooks';

/**
 * Общий фон рынка — не про выбранный инструмент (тот показывает
 * `Positioning` ниже), а про рынок целиком: настроение, капитализация,
 * самодельный индекс топ-20 и объём, запертый в DeFi.
 *
 * Каждая цифра — свой независимый запрос (хуки вызывает `Page.tsx`): одна
 * медленная плитка (DeFiLlama, без кеша на бэкенде) не должна держать три
 * готовые. «Нет данных» показано и на загрузке, и на ошибке запроса —
 * отдельного вида под ошибку нет ни у одного виджета этой страницы.
 */
export function MacroSnapshot({
  market,
  marketLoading,
  fearGreed,
  fearGreedLoading,
  cmc20,
  cmc20Loading,
  defiTvl,
  defiTvlLoading,
}: {
  market?: MarketData;
  marketLoading?: boolean;
  fearGreed?: FearGreedData;
  fearGreedLoading?: boolean;
  cmc20?: Cmc20Data;
  cmc20Loading?: boolean;
  defiTvl?: DeFiTVLData;
  defiTvlLoading?: boolean;
}) {
  const t = useTranslations('market');
  const { locale } = useLocaleControl();
  const lastTvl = defiTvl?.tvl.at(-1)?.tvl;

  const cell = (loading: boolean | undefined, node: React.ReactNode) =>
    loading ? <Skeleton as="span" flush height={16} width="58%" /> : node;

  return (
    <div className="coef coef-4" style={{ borderTop: 0 }}>
      <div>
        <div className="lbl">Fear & Greed</div>
        <div className="coef-v">{cell(fearGreedLoading, fearGreed ? fearGreed.value : '—')}</div>
        <div className="coef-sub">
          {cell(fearGreedLoading, fearGreed ? fearGreedLabel(fearGreed.classification, t) : '')}
        </div>
      </div>
      <div>
        <div className="lbl">{t('marketCap')}</div>
        <div className="coef-v">
          {cell(marketLoading, market ? fmtUsdCompact(market.marketCap, locale) : '—')}
        </div>
        <div className={`coef-sub${market ? ` ${market.marketCapChange24h >= 0 ? 'pos' : 'neg'}` : ''}`}>
          {cell(marketLoading, market ? fmtPctSigned(market.marketCapChange24h, 1) : '')}
        </div>
      </div>
      <div>
        <div className="lbl">
          {t('top20Index')}
          <Tooltip text={t('top20IndexHint')}>
            <span className="hint" tabIndex={0}>
              !
            </span>
          </Tooltip>
        </div>
        <div className="coef-v">{cell(cmc20Loading, cmc20 ? fmtUsdCompact(cmc20.index, locale) : '—')}</div>
        <div className={`coef-sub${cmc20 ? ` ${cmc20.change24h >= 0 ? 'pos' : 'neg'}` : ''}`}>
          {cell(cmc20Loading, cmc20 ? fmtPctSigned(cmc20.change24h, 1) : '')}
        </div>
      </div>
      <div>
        <div className="lbl">DeFi TVL</div>
        <div className="coef-v">
          {cell(defiTvlLoading, lastTvl != null ? fmtUsdCompact(lastTvl, locale) : '—')}
        </div>
      </div>
    </div>
  );
}
