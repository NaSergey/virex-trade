'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDownUp, ChevronDown, List, Maximize, Plus, Settings as SettingsIcon, Volume2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils/css';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { KeyValue } from '@/shared/ui/Lookup';
import { Seg } from '@/shared/ui/Seg';
import { Skeleton } from '@/shared/ui/Skeleton';
import { DEFAULT_TIMEFRAME, TIMEFRAMES } from '../lib/candles';
import { SPEEDS } from '../model/useReplay';
import { CoinPickerFace } from './CoinPicker';
import { useRailPanel } from '../model/useChartSettings';
import { useStoredLayout } from '../model/usePanes';
import { paneCount } from '../lib/panes';
import { useMediaQuery } from '@/shared/lib/hooks/useMediaQuery';
import { DrawingToolbar } from './drawings/DrawingToolbar';
import { SliderSlot } from './OrderPanel';

/**
 * Холст графика — заглушка на всю коробку родителя. Тот же `.replay-chart-wrap`,
 * что и у настоящего графика: раскладка одна, поэтому при появлении свечей
 * ничего не сдвигается.
 */
export function ChartSkeleton() {
  return (
    <div className="replay-chart-wrap">
      <Skeleton className="skel-canvas skel-fill" />
    </div>
  );
}

/** Полоса заглушки ровно по форме элемента, который стоит внутри невидимым. */
function Shape({ children }: { children: ReactNode }) {
  return (
    <span className="skel skel-flush skel-shape" aria-hidden>
      {children}
    </span>
  );
}

const noop = () => {};

/**
 * Выбор монеты, пока список не пришёл. Размер берёт сама кнопка — она стоит
 * внутри невидимой, с тем же классом постоянной ширины (`.coin-pick-btn`), что
 * и настоящая, поэтому приход списка ничего в строке не сдвигает. Тикер в ней
 * не виден, но нужен: строка выравнивает элементы по базовой линии текста.
 */
export function CoinSkeleton() {
  return (
    <Shape>
      <span className="coin-pick-btn">
        <CoinPickerFace symbol="BTCUSDT" base="BTC" placeholder />
      </span>
    </Shape>
  );
}

export interface TerminalSkeletonProps {
  /**
   * Эфир или биржа: время ведут часы — ни «Шага», ни скорости нет, зато есть
   * выбор монеты. Не задано — экран прокрутки истории.
   */
  live?: boolean;
  /**
   * Надпись на месте кнопок прокрутки у эфира («Эфир», «Bybit · настоящий счёт»).
   * `null` — ещё неизвестно, чей это экран: на её месте серая полоса; `false` —
   * подписи нет (терминал на главной).
   */
  badge?: string | null | false;
  /** Есть ли кнопка «К списку» — у биржевого терминала её нет. */
  leave?: boolean;
  /** Вкладки таблиц под графиком; у терминала на главной их нет. */
  tables?: boolean;
  /** Рейка справа «Терминал / Монеты»; у терминала на главной её нет. */
  rail?: boolean;
  /** Сетка графиков `/terminal` — заглушка рисует сохранённую раскладку. */
  multiChart?: boolean;
}

/** Каркас списка монет (`Watchlist`): шапка и строки той же высоты, без цен. */
function WatchSkeleton() {
  const t = useTranslations('backtest');
  return (
    <section className="watch" aria-label={t('watch.title')}>
      <div className="watch-head">
        <span className="watch-title">{t('watch.title')}</span>
        <Button variant="bare" tight aria-label={t('watch.add')}>
          <Plus size={16} />
        </Button>
      </div>
      <div className="watch-cols muted" aria-hidden>
        <span>{t('watch.symbol')}</span>
        <span>{t('watch.last')}</span>
        <span>{t('watch.change')}</span>
      </div>
      <div className="watch-list">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="watch-row">
            <span className="watch-pick">
              <Skeleton as="span" inline width={72} height={12} flush />
              <Skeleton as="span" inline width={64} height={12} flush />
              <Skeleton as="span" inline width={44} height={12} flush />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Экран терминала до прихода данных.
 *
 * Всё, что от данных не зависит, здесь настоящее и стоит на своих местах:
 * линейка ТФ, звук и настройки, панель рисования, кнопки прокрутки, вкладки,
 * подписи и кнопки панели ордера. Серым — только данные: монета, график,
 * депозит, плечо, риск. Заглушки «на глаз» (полоса 272px вместо линейки ТФ,
 * восемь квадратов вместо десяти кнопок рисования, блоки вместо полей панели)
 * не совпадали с настоящим экраном, и приход данных сдвигал всё сразу.
 *
 * Корень — `inert`: кнопки видны, но не нажимаются и не берут фокус.
 */
export function TerminalSkeleton({
  live = false,
  badge,
  leave = true,
  tables = true,
  rail = true,
  multiChart = false,
}: TerminalSkeletonProps) {
  const t = useTranslations('backtest');
  const tAudio = useTranslations('audio');
  // Свёрнута ли колонка — тот же выбор на устройстве, что у терминала: иначе
  // приход данных раскрывал бы или сворачивал её на глазах.
  const [railPanel] = useRailPanel();
  // Сетка графиков — та же, что у терминала (и так же только на широком экране).
  const storedLayout = useStoredLayout();
  const wide = useMediaQuery('(min-width: 1101px)');
  const layout = multiChart && live && wide ? storedLayout : '1';
  // Список монет бывает только в эфире; у истории запомненное «Монеты» — панель ордера, как у экрана.
  const watch = rail && live && railPanel === 'watch';

  return (
    <div className="bt-live px-4" aria-busy="true" inert>
      <div className={cn('asym terminal', rail && 'has-rail')} data-rail={railPanel}>
        <div className="terminal-main">
          <div className="terminal-chart">
            <div className="chart-top">
              <div className="chart-top-l">
                {live && <CoinSkeleton />}
                {live && <span className="chart-top-sep" aria-hidden />}
                <Seg
                  options={TIMEFRAMES.map((tf) => ({ value: tf, label: t(`tf.${tf}`) }))}
                  value={DEFAULT_TIMEFRAME}
                  onChange={noop}
                  ariaLabel={t('timeframe')}
                />
              </div>
              <div className="chart-top-r">
                <Button variant="bare" tight aria-label={tAudio('sound')}>
                  <Volume2 size={16} />
                </Button>
                <div className="chart-settings">
                  <Button variant="bare" tight aria-label={t('chartSettings')}>
                    <SettingsIcon size={16} />
                  </Button>
                </div>
                <Button variant="bare" tight aria-label={t('fullscreen')}>
                  <Maximize size={16} />
                </Button>
              </div>
            </div>
            <div className="chart-tools">
              <DrawingToolbar
                tool={null}
                onTool={noop}
                magnet={false}
                onMagnet={noop}
                hidden={false}
                onHidden={noop}
                canClear={false}
                onClear={noop}
              />
              <div className="chart-tools-main">
                {layout === '1' ? (
                  <ChartSkeleton />
                ) : (
                  <div className="panes" data-layout={layout}>
                    {Array.from({ length: paneCount(layout) }, (_, i) => (
                      <div key={i} className={cn('pane', i === 0 && 'on')}>
                        <ChartSkeleton />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="terminal-controls">
            {(!live || badge !== false || tables || leave) && (
              <div className="replay-controls">
                {live ? (
                  badge === null ? (
                    <Skeleton as="span" inline width={160} height={12} flush />
                  ) : (
                    <span className="muted">{badge ?? t('liveBadge')}</span>
                  )
                ) : (
                  <>
                    <Button variant="solid" disabled>
                      {t('step')} ▶
                    </Button>
                    <Seg
                      options={[{ value: 0, label: t('pause') }, ...SPEEDS.map((s) => ({ value: s, label: `×${s}` }))]}
                      value={0}
                      onChange={noop}
                      ariaLabel={t('speed')}
                    />
                  </>
                )}
                {leave && <Button tight>{t('backToList')}</Button>}
                {tables && (
                  <Seg
                    className="view-switch"
                    options={[
                      { value: 'open' as const, label: t('openPositionsTab') },
                      { value: 'orders' as const, label: t('ordersTab') },
                      { value: 'history' as const, label: t('historyTab') },
                    ]}
                    value="open"
                    onChange={noop}
                    ariaLabel={t('openPositionsTab')}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="marg">
          {rail && live && (
            <Seg
              className="rail-seg"
              options={[
                { value: 'order' as const, label: t('rail.order') },
                { value: 'watch' as const, label: t('rail.watch') },
              ]}
              value={watch ? 'watch' : 'order'}
              onChange={noop}
              ariaLabel={t('rail.label')}
            />
          )}
          {/* Та же разметка, что у OrderPanel на вкладке «Маркет», — без чисел;
              у запомненного списка монет — каркас списка. */}
          <div className="panel-swap panel-swap-fill">
          {watch ? (
            <WatchSkeleton />
          ) : (
          <div className="order-panel">
            <div className="panel-top">
              <div className="lev">
                <Shape>
                  <Button variant="none" className="lev-btn">
                    10×<ChevronDown size={12} className="lev-caret" />
                  </Button>
                </Shape>
              </div>
              <KeyValue label={t('balance')}>
                <Skeleton as="span" inline width={110} height={12} flush />
              </KeyValue>
            </div>
            <Seg
              className="order-tabs"
              options={[
                { value: 'market' as const, label: t('orderTabMarket') },
                { value: 'limit' as const, label: t('orderTabLimit') },
                { value: 'scaled' as const, label: t('orderTabScaled') },
              ]}
              value="market"
              onChange={noop}
              ariaLabel={t('orderType')}
            />
            <Field
              label={
                <span className="fld-head">
                  <span className="fld-left">
                    <span className="fld-val"></span>
                    <span>{t('risk')}</span>
                  </span>
                  <Skeleton as="span" inline width={90} height={12} flush />
                </span>
              }
            >
              <SliderSlot />
            </Field>
            <Field
              label={
                <span className="fld-head">
                  <span>
                    {t('take')} {t('takeOptional')}
                  </span>
                </span>
              }
            >
              <SliderSlot />
            </Field>
            <Field
              label={
                <span className="fld-head">
                  <span>{t('stop')}</span>
                </span>
              }
            >
              <SliderSlot />
            </Field>
            <div className="order-foot">
              <div className="size-preview">
                <KeyValue label={t('sizeCoin')}>—</KeyValue>
                <KeyValue label={t('notionalLabel')}>—</KeyValue>
              </div>
              <div className="order-actions">
                <Button variant="long">{t('long')}</Button>
                <Button variant="short">{t('short')}</Button>
              </div>
            </div>
          </div>
          )}
          </div>
        </div>
        {rail && (
          <nav className="term-rail" aria-label={t('rail.label')}>
            <Button variant="bare" className={cn('rail-btn', railPanel !== 'none' && !watch && 'on')} aria-label={t('rail.order')}>
              <ArrowDownUp size={20} />
            </Button>
            {live && (
              <Button variant="bare" className={cn('rail-btn', watch && 'on')} aria-label={t('rail.watch')}>
                <List size={20} />
              </Button>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
