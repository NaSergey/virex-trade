'use client';

import { useState } from 'react';
import { Check, ChevronUp, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PokerAction, PokerView } from '@/entities/game-table';
import { cn } from '@/shared/lib/utils/css';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { Slider } from '@/shared/ui/Slider';
import { presetRaiseTo, RAISE_PRESETS } from '../lib/raise';

/**
 * Панель хода: пресеты от банка, ползунок, сумма и три кнопки — Fold, Call
 * (или Check, если уравнивать нечего), Raise (Bet на пустой улице, All-in на
 * весь стек). Не в свой ход кнопки стоят, но неактивны: панель не прыгает.
 *
 * Сумма — итоговая ставка на улице («рейз до»), как её и принимает сервер.
 * Состояние панели сбрасывается родителем через `key` на каждом новом ходе.
 */
export function ActionBar({
  view,
  pending,
  onAct,
}: {
  view: PokerView;
  pending: boolean;
  onAct: (action: PokerAction) => void;
}) {
  const t = useTranslations('poker');
  const lg = view.me.legal;
  const hand = view.hand;
  const min = lg?.minRaiseTo ?? 0;
  const max = lg?.maxRaiseTo ?? 0;
  const canRaise = lg != null && lg.minRaiseTo != null;
  const [amount, setAmount] = useState(min);
  const [draft, setDraft] = useState(String(min));

  const set = (n: number) => {
    const v = Math.min(max, Math.max(min, Math.round(n)));
    setAmount(v);
    setDraft(String(v));
  };

  const bets = view.seats.reduce((a, s) => a + s.bet, 0);
  const myBet = view.seats.find((s) => s.seatIndex === view.me.seatIndex)?.bet ?? 0;
  const preset = (pct: number) =>
    presetRaiseTo(pct, {
      pot: hand?.pot ?? 0,
      bets,
      toCall: lg?.toCall ?? 0,
      currentBet: hand?.currentBet ?? 0,
      min,
      max,
    });

  const raiseWord = amount >= max ? t('act.allIn') : (hand?.currentBet ?? 0) === 0 ? t('act.bet') : t('act.raise');
  const off = !lg || pending;

  return (
    <div className="pk-actions">
      <div className="pk-sizing">
        {RAISE_PRESETS.map((pct) => (
          <Button key={pct} variant="none" className="pk-chip" disabled={off || !canRaise} onClick={() => set(preset(pct))}>
            {Math.round(pct * 100)}%
          </Button>
        ))}
        <Slider
          className="pk-slider"
          value={amount}
          min={min}
          max={Math.max(min, max)}
          onChange={set}
          disabled={off || !canRaise || min === max}
          aria-label={t('amountLabel')}
        />
        <Input
          className="pk-amount n"
          inputMode="numeric"
          aria-label={t('amountLabel')}
          value={draft}
          disabled={off || !canRaise}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
          onBlur={() => set(Number(draft) || min)}
        />
      </div>
      <div className="pk-buttons">
        <Button variant="none" className="ct-act pk-fold" disabled={off} onClick={() => onAct({ type: 'fold' })}>
          <X aria-hidden />
          <span>{t('act.fold')}</span>
        </Button>
        {lg?.canCheck !== false ? (
          <Button variant="none" className="ct-act pk-call" disabled={off} onClick={() => onAct({ type: 'check' })}>
            <Check aria-hidden />
            <span>{t('act.check')}</span>
          </Button>
        ) : (
          <Button variant="none" className="ct-act pk-call" disabled={off} onClick={() => onAct({ type: 'call' })}>
            <Check aria-hidden />
            <span>
              {t('act.call')}
              <small className="n">{Math.min(lg.toCall, lg.maxRaiseTo - myBet).toLocaleString()}</small>
            </span>
          </Button>
        )}
        <Button
          variant="none"
          className={cn('ct-act pk-raise')}
          disabled={off || !canRaise}
          onClick={() => onAct({ type: 'raise', amount })}
        >
          <ChevronUp aria-hidden />
          <span>
            {raiseWord}
            {canRaise && <small className="n">{amount.toLocaleString()}</small>}
          </span>
        </Button>
      </div>
    </div>
  );
}
