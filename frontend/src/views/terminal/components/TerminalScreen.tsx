'use client';

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { useQueries, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { fetchPositionTags } from '@/entities/tag';
import { useTrades } from '@/entities/trade';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Wrap } from '@/shared/ui/Wrap';
import { useTerminalAccess } from '@/entities/terminal';
import { Terminal, TerminalSkeleton, type SessionDetail } from '@/widgets/backtest-session';
import { EXCHANGE_SOURCE, terminalStateQuery, useTerminalState, useTerminalSymbols } from '../api/hooks';
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
 *
 * Снимок счёта приходит в экран переходом (`startTransition`), а не прямо из
 * `useQuery`: опрос раз в три секунды меняет P&L и депозит, а react-query отдаёт
 * данные через `useSyncExternalStore`, и такое обновление React рисует одним
 * куском. Каждый ответ перерисовывал весь терминал синхронно — 120–220 мс раз в
 * три секунды в dev-сборке при ЦП ×2, и ползунки панели в это время стояли
 * (жалоба владельца 2026-10-17). На запрос подписан отдельный узел без разметки
 * (`StateFeed`). Действия (мутации) остаются срочными: защита от второго ордера
 * держится на их `isPending`.
 */
export function TerminalScreen() {
  const badge = useAccountBadge();
  const qc = useQueryClient();
  // Начало — из кэша: вернувшийся на терминал видит снимок сразу, без заглушки.
  const [data, setData] = useState(() => qc.getQueryData(terminalStateQuery.queryKey));
  const [error, setError] = useState<Error | null>(() => qc.getQueryState(terminalStateQuery.queryKey)?.error ?? null);
  const feed = useCallback((next: StateSnapshot) => {
    startTransition(() => {
      setData(next.data);
      setError(next.error);
    });
  }, []);

  return (
    <>
      <StateFeed onChange={feed} />
      {data ? (
        <ExchangeTerminal state={data} stale={error != null} />
      ) : error ? (
        <StateError error={error} />
      ) : (
        <TerminalSkeleton live badge={badge} leave={false} />
      )}
    </>
  );
}

interface StateSnapshot {
  data: TerminalState | undefined;
  error: Error | null;
}

/** Опрос счёта — узел без разметки: его перерисовка на каждом ответе ничего не стоит. */
function StateFeed({ onChange }: { onChange: (next: StateSnapshot) => void }) {
  const { data, error } = useTerminalState();
  useEffect(() => onChange({ data, error }), [data, error, onChange]);
  return null;
}

function StateError({ error }: { error: Error }) {
  const tt = useTranslations('terminal');
  const { refetch, isFetching } = useTerminalState();
  return (
    <Wrap page>
      <ErrorNote error={error} fallback={tt('loadFailed')} />
      <Button variant="solid" disabled={isFetching} onClick={() => void refetch()}>
        {tt('retry')}
      </Button>
    </Wrap>
  );
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
 * - стоп за тейками и стоп после исполнения сетки входа ведёт worker (не экран);
 * - кнопки «К списку» нет — уходить некуда.
 */
/**
 * Подпись над графиком — какой это счёт. Демо-ключ Bybit (биржа `bybit-demo`)
 * торгует тем же экраном, и «настоящий счёт» на нём был бы неправдой.
 */
function useAccountBadge(): string {
  const tt = useTranslations('terminal');
  const demo = useTerminalAccess().data?.exchange === 'bybit-demo';
  return tt(demo ? 'demoBadge' : 'realBadge');
}

function ExchangeTerminal({ state, stale }: { state: TerminalState; stale: boolean }) {
  const tt = useTranslations('terminal');
  const badge = useAccountBadge();
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
        // Какой это счёт (настоящий или демо Bybit) — сказано словами: экран тот же, что у бектеста, и спутать их можно ровно один раз.
        badge={badge}
        soundsOf={sounds}
        history={ExchangeHistory}
        tagStatsFrom="journal"
      />
    </>
  );
}
