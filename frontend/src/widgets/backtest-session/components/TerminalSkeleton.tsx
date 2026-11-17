'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Plus, Settings as SettingsIcon, Volume2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils/css';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { KeyValue } from '@/shared/ui/Lookup';
import { Seg } from '@/shared/ui/Seg';
import { Skeleton } from '@/shared/ui/Skeleton';
import { DEFAULT_TIMEFRAME, TIMEFRAMES } from '../lib/candles';
import { SPEEDS } from '../model/useReplay';
import { CoinPickerFace } from './CoinPicker';
import { usePanelWidth, useRailPanel } from '../model/useChartSettings';
import { useStoredLayout } from '../model/usePanes';
import { LayoutPicker } from './LayoutPicker';
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
  /** Есть ли кнопка «К списку» — у биржевого терминала её нет. */
  leave?: boolean;
  /** Вкладки таблиц под графиком; у терминала на главной их нет. */
  tables?: boolean;
  /** Вкладки «Терминал / Монеты» над правой колонкой; у терминала на главной их нет. */
  watchlist?: boolean;
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
  leave = true,
  tables = true,
  watchlist = true,
  multiChart = false,
}: TerminalSkeletonProps) {
  const t = useTranslations('backtest');
  const tAudio = useTranslations('audio');
  // Свёрнута ли колонка — тот же выбор на устройстве, что у терминала: иначе
  // приход данных раскрывал бы или сворачивал её на глазах.
  const [railPanel] = useRailPanel();
  // Ширина колонки — та же, что у терминала, иначе приход данных сдвигал бы её.
  const [panelWidth] = usePanelWidth();
  // Сетка графиков — та же, что у терминала (и так же только на широком экране).
  const storedLayout = useStoredLayout();
  const wide = useMediaQuery('(min-width: 1101px)');
  const multi = multiChart && live && wide;
  const layout = multi ? storedLayout : '1';
  // Список монет бывает только в эфире; у истории запомненное «Монеты» — панель ордера, как у экрана.
  const watch = watchlist && live && railPanel === 'watch';

  return (
    <div className="bt-live" aria-busy="true" inert>
      <div className={cn('asym terminal', live && 'chart-full')} style={{ '--panel-w': `${panelWidth}px` } as CSSProperties}>
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
                {multi && (
                  <>
                    <span className="chart-top-sep" aria-hidden />
                    <LayoutPicker value={layout} onChange={noop} />
                  </>
                )}
              </div>
              <div className="chart-top-r">
                {leave && (
                  <Button tight className="mr-2">
                    {t('backToList')}
                  </Button>
                )}
                <Button variant="bare" tight aria-label={tAudio('sound')}>
                  <Volume2 size={16} />
                </Button>
                <div className="chart-settings">
                  <Button variant="bare" tight aria-label={t('chartSettings')}>
                    <SettingsIcon size={16} />
                  </Button>
                </div>
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
          {/* Строка под графиком — только у прокрутки истории; в эфире её нет, график до низа. */}
          {!live && (
            <div className="terminal-controls">
              <div className="replay-controls">
                <Button variant="solid" disabled>
                  {t('step')} ▶
                </Button>
                <Seg
                  options={[{ value: 0, label: t('pause') }, ...SPEEDS.map((s) => ({ value: s, label: `×${s}` }))]}
                  value={0}
                  onChange={noop}
                  ariaLabel={t('speed')}
                />
              </div>
            </div>
          )}
        </div>

        <div className="term-split" aria-hidden />

        <div className="marg">
          {watchlist && live && (
            <div className="panel-tabs" role="tablist" aria-label={t('rail.label')}>
              {(['order', 'watch'] as const).map((id) => (
                <Button key={id} variant="none" role="tab" className={cn('panel-tab', (id === 'watch') === watch && 'on')}>
                  {t(`rail.${id}`)}
                </Button>
              ))}
            </div>
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
        {tables && (
          <div className="table-tabs" role="tablist" aria-label={t('openPositionsTab')}>
            {(['open', 'orders', 'history'] as const).map((id) => (
              <Button key={id} variant="none" role="tab" className={cn('panel-tab', id === 'open' && 'on')}>
                {t(`tabShort.${id}`)}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
