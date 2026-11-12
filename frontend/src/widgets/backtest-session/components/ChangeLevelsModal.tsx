'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader, useDialogFade } from '@/shared/ui/dialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { FieldGroup } from '@/shared/ui/Field';
import { KeyValue } from '@/shared/ui/Lookup';
import { fmtPctSigned, formatMoney, formatPriceGrouped } from '@/shared/lib/utils/format';
import type { BacktestTrade, PositionLike } from '../api/types';
import { checkLevels, closeImpact, toScreen } from '../lib/money';
import { StepRow } from './CloseFields';
import { PriceInput } from './PriceInput';
import { TrailToggle } from './TrailToggle';

/**
 * Правка стопа/тейка открытой сделки — модалка, а не инлайн-поля панели:
 * `OrderPanel` больше не смотрит на то, открыта ли сделка, значит редактировать
 * уже существующие уровни негде, кроме отдельного диалога.
 *
 * Раскладка — как у окон закрытия (и у окна TP/SL биржи): цена входа и рыночная
 * строками, стоп и тейк полями со степперами, под каждым итог в рамке — сколько
 * принесёт срабатывание на весь остаток. Ползунков нет: уровень тянут на графике.
 */
export function ChangeLevelsModal({
  trade,
  remaining,
  scale,
  screenPrice,
  onApply,
  onClose,
  isPending,
  error,
  decimals,
  showSymbol = true,
}: {
  trade: PositionLike & Pick<BacktestTrade, 'trailDist'>;
  /** Остаток открытой позиции в монете (qty - closedQty) — на него считается итог уровня. */
  remaining: number;
  scale: number;
  /** Текущая экранная цена — от неё проценты уровней. */
  screenPrice: number;
  /** `trail` — подводящий стоп: включён ли он после применения. */
  onApply: (stop: number, take: number | null, trail: boolean) => void;
  onClose: () => void;
  isPending: boolean;
  error: unknown;
  /** Знаков цены монеты сделки; не задано — общее правило формата. */
  decimals?: number;
  /** Монета в подзаголовке; снимается у истории со случайной монетой — она скрыта до итога. */
  showSymbol?: boolean;
}) {
  const t = useTranslations('backtest');
  const { closing, close } = useDialogFade(onClose);
  // Позиция без стопа (бывает только на бирже) начинает с цены: это заведомо неверный
  // стоп, и окно не даст применить его, пока человек не поставит свой.
  const [stop, setStop] = useState(() => (trade.stopLoss > 0 ? toScreen(trade.stopLoss, scale) : screenPrice));
  const [take, setTake] = useState<number | null>(() => (trade.takeProfit != null ? toScreen(trade.takeProfit, scale) : null));
  // Подводящий стоп: включают — от цены сейчас до стопа в окне (`trailDistOf`).
  const [trail, setTrail] = useState(trade.trailDist != null);
  const stopPct = ((stop - screenPrice) / screenPrice) * 100;
  const takePct = take != null ? ((take - screenPrice) / screenPrice) * 100 : null;
  const err = checkLevels(trade.direction, screenPrice, stop, take);

  // Шаг степпера — последний знак цены монеты, как у окна лимита закрытия.
  const digits = decimals ?? 2;
  const step = 10 ** -digits;
  const moved = (p: number, dir: 1 | -1) => Math.max(step, Number((p + dir * step).toFixed(digits)));
  const hint = (price: number) =>
    t('levelCloseHint', { price: formatPriceGrouped(price, decimals), pnl: formatMoney(closeImpact(trade, scale, price, remaining).usdt) });

  return (
    <Dialog open={!closing} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader
          title={t('changeLevelsTitle')}
          subtitle={`${showSymbol ? `${trade.symbol} · ` : ''}${t(`direction.${trade.direction}`)}`}
        />
        <DialogBody>
          <KeyValue label={t('entryPrice')}>{formatPriceGrouped(toScreen(trade.entryPrice, scale), decimals)}</KeyValue>
          <KeyValue label={t('marketPrice')}>{formatPriceGrouped(screenPrice, decimals)}</KeyValue>
          {/* FieldGroup, а не Field: кнопка «Подводящий» внутри <label> поля — невалидная разметка. */}
          <FieldGroup
            label={
              <span className="fld-head">
                <span className="fld-left">
                  <span>{t('stop')}</span>
                  <TrailToggle on={trail} onChange={setTrail} />
                </span>
                <span className="fld-val">{fmtPctSigned(stopPct)}</span>
              </span>
            }
          >
            <StepRow label={t('stop')} onDec={() => setStop((p) => moved(p, -1))} onInc={() => setStop((p) => moved(p, 1))}>
              <PriceInput full aria-label={t('stop')} value={stop} onChange={setStop} />
            </StepRow>
          </FieldGroup>
          <p className="close-note">{hint(stop)}</p>
          <FieldGroup
            label={
              <span className="fld-head">
                <span>{t('take')}</span>
                {takePct != null && <span className="fld-val">{fmtPctSigned(takePct)}</span>}
              </span>
            }
          >
            <StepRow
              label={t('take')}
              onDec={() => setTake((p) => moved(p ?? screenPrice, -1))}
              onInc={() => setTake((p) => moved(p ?? screenPrice, 1))}
            >
              <PriceInput full aria-label={t('take')} value={take} onChange={setTake} onClear={() => setTake(null)} />
            </StepRow>
          </FieldGroup>
          <p className="close-note">{take != null ? hint(take) : t('levelNoTake')}</p>
          {err && <p className="neg">{t(err)}</p>}
          <ErrorNote error={error} fallback={t('actionFailed')} />
        </DialogBody>
        <DialogActions
          confirmLabel={t('apply')}
          confirmDisabled={isPending || err != null}
          onConfirm={() => onApply(stop, take, trail)}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}
