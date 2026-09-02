'use client';

import { useTranslations } from 'next-intl';
import { MetricCell } from '@/shared/ui/MetricCell';
import { useLocaleControl } from '@/shared/i18n';
import { fmtPctSigned } from '@/shared/lib/utils/format';
import { fmtUsdCompact } from './SentimentChart';
import { fearGreedLabel } from '../lib/fearGreedLabel';
import type { MarketData, FearGreedData, DeFiTVLData, Cmc20Data } from '../api/hooks';

/**
 * Общий фон рынка — не про выбранный инструмент (тот показывает
 * `Positioning` ниже) и не про историю (её показывает «Ритм рынка»), а про
 * рынок целиком прямо сейчас: настроение, капитализация, самодельный индекс
 * топ-20 и объём, запертый в DeFi.
 *
 * Плотная строка `.metrics`/`.mcell` — та же, что держит свод периода на
 * «Обзоре» (`SummaryStrip`), только на четыре равные колонки вместо девяти
 * неравных под конкретные подписи (`.metrics-4`, см. globals.css).
 *
 * У каждой из четырёх величин есть вторая строка — суточное изменение или
 * словесная классификация. Без неё число висит без масштаба: «$4.1 T» ничего
 * не говорит, пока не видно, вверх это или вниз.
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
  const prevTvl = defiTvl?.tvl.at(-2)?.tvl;
  /*
   * Изменение TVL считаем сами по двум последним точкам ряда: сервер отдаёт
   * ряд, а не сводку, и держать четвёртую плитку без второй строки, когда у
   * трёх соседних она есть, значило бы уронить ряд на ровном месте. Шаг ряда —
   * сутки, поэтому это то же «за 24 часа», что и у соседей.
   */
  const tvlChange =
    lastTvl != null && prevTvl != null && prevTvl > 0 ? ((lastTvl - prevTvl) / prevTvl) * 100 : null;

  const tone = (v: number | null | undefined) => (v == null ? undefined : v >= 0 ? 'pos' : 'neg');

  return (
    <div className="metrics metrics-4" data-tour="market-macro">
      <MetricCell
        label="Fear & Greed"
        loading={fearGreedLoading}
        value={fearGreed ? fearGreed.value : '—'}
        sub={fearGreed ? fearGreedLabel(fearGreed.classification, t) : ''}
      />
      <MetricCell
        label={t('marketCap')}
        loading={marketLoading}
        value={market ? fmtUsdCompact(market.marketCap, locale) : '—'}
        sub={market ? fmtPctSigned(market.marketCapChange24h, 1) : ''}
        subTone={tone(market?.marketCapChange24h)}
      />
      <MetricCell
        label={t('top20Index')}
        hint={t('top20IndexHint')}
        loading={cmc20Loading}
        value={cmc20 ? fmtUsdCompact(cmc20.index, locale) : '—'}
        sub={cmc20 ? fmtPctSigned(cmc20.change24h, 1) : ''}
        subTone={tone(cmc20?.change24h)}
      />
      <MetricCell
        label="DeFi TVL"
        loading={defiTvlLoading}
        value={lastTvl != null ? fmtUsdCompact(lastTvl, locale) : '—'}
        sub={tvlChange != null ? fmtPctSigned(tvlChange, 1) : ''}
        subTone={tone(tvlChange)}
      />
    </div>
  );
}
