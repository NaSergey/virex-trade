'use client';

import { useCallback, useMemo } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { fetchPositionTags } from '@/entities/tag';
import { useTrades } from '@/entities/trade';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Wrap } from '@/shared/ui/Wrap';
import { Terminal, TerminalSkeleton, type SessionDetail } from '@/widgets/backtest-session';
import { EXCHANGE_SOURCE, useTerminalState, useTerminalSymbols } from '../api/hooks';
import { positionKey, type TerminalState, type TerminalSymbol } from '../api/types';
import { toDetail, type ExchangeDetail, type PositionMeta } from '../lib/adapt';
import { exchangeSounds } from '../lib/sounds';
import { useExchangeActions } from '../model/useExchangeActions';
import { ExchangeHistory } from './ExchangeHistory';

/** Сколько последних закрытых сделок журнала отмечать стрелками на графике. */
const MARKED_TRADES = 100;

/** Пока список монет Bybit едет, монет нет вовсе — а не монеты эфира с рынка продукта. */
const NO_SYMBOLS: TerminalSymbol[] = [];

/**
 * Что о позициях знаем мы, а не биржа, — по порядку позиций. Функция модуля:
 * `useQueries` держит её результат прежним, пока ответы не изменились, и
 * снимок счёта не пересобирается на каждый рендер.
 */
const metaOf = (results: UseQueryResult<{ tags: PositionMeta['tags']; openedAt: string | null }>[]) =>
  results.map((r) => (r.data ? { tags: r.data.tags, openedAt: r.data.openedAt } : null));

/**
 * Сигналы — по снимкам самого счёта, а не по их форме сессии: закрытая позиция
 * с биржи просто пропадает, а правила сессии ждут её в списке закрытой.
 * Функция модуля — ссылка стабильна.
 */
const sounds = (was: SessionDetail, next: SessionDetail) =>
  exchangeSounds((was as ExchangeDetail).exchange, (next as ExchangeDetail).exchange);

/**
 * Биржевой терминал: загрузка счёта и тот же экран, что у бектеста и турнира.
 *
 * Заглушка — общая с ними: сетка экрана одна, и приход счёта ничего не сдвигает.
 */
export function TerminalScreen() {
  const tt = useTranslations('terminal');
  const { data, error, refetch, isFetching } = useTerminalState();
  if (!data) {
    if (!error) return <TerminalSkeleton />;
    return (
      <Wrap page>
        <ErrorNote error={error} fallback={tt('loadFailed')} />
        <Button variant="solid" disabled={isFetching} onClick={() => void refetch()}>
          {tt('retry')}
        </Button>
      </Wrap>
    );
  }
  return <ExchangeTerminal state={data} stale={error != null} />;
}

/**
 * Терминал на счёте Bybit. Своего экрана здесь нет — рендерится общий
 * `Terminal` из `widgets/backtest-session`, тот же, что у бектеста и турнира.
 * Эта обёртка делает две вещи: переводит снимок счёта в форму сессии, которой
 * терминал думает (`toDetail`), и подставляет действия, уходящие на биржу
 * (`useExchangeActions`).
 *
 * Отличий от сессии ровно столько, сколько их у самой биржи:
 * - свечи, цены и монеты — Bybit, а не рынок продукта: исполняет он;
 * - история — закрытые сделки журнала: у счёта нет сессии, которая несла бы свои;
 * - «стопа за тейками» в сетке фиксации нет: двигать стоп на бирже некому;
 * - кнопки «К списку» нет — уходить некуда.
 */
function ExchangeTerminal({ state, stale }: { state: TerminalState; stale: boolean }) {
  const tt = useTranslations('terminal');
  const actions = useExchangeActions();
  const { data: symbolsData } = useTerminalSymbols();

  // Теги и время открытия позиции знает не биржа, а мы — тем же запросом, что на обзоре.
  const metas = useQueries({
    queries: state.positions.map((p) => ({
      queryKey: ['positionTags', p.symbol, p.direction] as const,
      queryFn: () => fetchPositionTags(p.symbol, p.direction),
      staleTime: 15_000,
    })),
    combine: metaOf,
  });
  // Закрытые сделки журнала — ради стрелок входа и выхода на графике.
  const { data: journal } = useTrades({ pageSize: MARKED_TRADES });

  const detail = useMemo(() => {
    const meta = new Map<string, PositionMeta>();
    state.positions.forEach((p, i) => {
      const known = metas[i];
      if (known) meta.set(positionKey(p), known);
    });
    return toDetail(state, meta, journal?.trades ?? []);
  }, [state, journal, metas]);

  const decimals = useMemo(() => new Map((symbolsData?.symbols ?? []).map((s) => [s.symbol, s.decimals])), [symbolsData]);
  const decimalsOf = useCallback((symbol: string) => decimals.get(symbol), [decimals]);
  // Цена монеты, которой нет на графике, — маркировка биржи из того же снимка счёта.
  const priceOf = (symbol: string) => state.positions.find((p) => p.symbol === symbol)?.markPrice ?? null;

  return (
    <>
      {/* Счёт есть, но последний опрос не удался: экран остаётся, а о том, что числа
          могли устареть, сказано вслух — на них стоят настоящие деньги. */}
      {stale && <p className="neg px-4">{tt('stale')}</p>}
      <Terminal
        detail={detail}
        actions={actions}
        source={EXCHANGE_SOURCE}
        symbols={symbolsData?.symbols ?? NO_SYMBOLS}
        decimalsOf={decimalsOf}
        priceOf={priceOf}
        // Настоящий счёт — сказано словами: экран тот же, что у бектеста, и спутать их можно ровно один раз.
        badge={tt('realBadge')}
        soundsOf={sounds}
        history={<ExchangeHistory />}
        canFollow={false}
      />
    </>
  );
}
