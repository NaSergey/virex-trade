'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useCoinBalance } from '@/entities/coins';
import { useJetpackBet, useJetpackCashout, type JetpackView } from '@/entities/jetpack';
import { cn } from '@/shared/lib/utils/css';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, Input } from '@/shared/ui/Field';
import { formatX, payout, x100At } from '../lib/flight';
import { useFrames } from '../model/useFrames';

const AUTO_RE = /^\d+(\.\d{1,2})?$/;

/**
 * Ставка на раунд: сумма, автовывод и одна главная кнопка по состоянию —
 * «Поставить» → «Ставка принята» → «Забрать N» → итог раунда. Сумма «Забрать»
 * растёт с множителем и пишется в DOM каждым кадром; сервер всё равно
 * считает вывод по времени прихода запроса, а клиент отстаёт от его часов на
 * задержку сети — забранное не меньше показанного.
 *
 * Ошибка действия показывается, только пока идёт раунд, в котором её
 * получили: «ставки не принимаются» из прошлого раунда в новом окне — ложь.
 * Действие сбрасывает ошибку и второй мутации: иначе успешная ставка нового
 * раунда показала бы под собой «не успели» из прошлого.
 */
export function BetPanel({ view }: { view: JetpackView }) {
  const t = useTranslations('jetpack');
  const bet = useJetpackBet();
  const cash = useJetpackCashout();
  const { data: coins } = useCoinBalance();
  const [amount, setAmount] = useState('10');
  const [autoOn, setAutoOn] = useState(false);
  const [auto, setAuto] = useState('2.00');
  const [actedIn, setActedIn] = useState<string | null>(null);
  const live = useRef<HTMLSpanElement>(null);

  const { minBet, maxBet, minAutoX100, maxAutoX100 } = view.limits;
  const me = view.me;
  const n = Number(amount);
  const amountOk = Number.isInteger(n) && n >= minBet && n <= maxBet && n <= (coins?.balance ?? Infinity);
  const autoX100 = AUTO_RE.test(auto) ? Math.round(Number(auto) * 100) : NaN;
  const autoOk = !autoOn || (autoX100 >= minAutoX100 && autoX100 <= maxAutoX100);
  const open = view.phase === 'betting' && !me;
  const canCash = view.phase === 'flying' && !!me && me.cashoutX100 === null;
  const error = actedIn === view.roundId ? (bet.error ?? cash.error) : null;

  useFrames(canCash, () => {
    if (!live.current || !me || view.launchedAt === null) return;
    const x = Math.min(x100At(Date.now() + view.offset - view.launchedAt, view.rate), me.autoX100 ?? Infinity);
    live.current.textContent = payout(me.amount, x).toLocaleString();
  });

  const setN = (v: number) =>
    setAmount(String(Number.isFinite(v) ? Math.min(maxBet, Math.max(minBet, Math.floor(v))) : minBet));
  const place = () => {
    setActedIn(view.roundId);
    cash.reset();
    bet.mutate({ amount: n, autoCashout: autoOn ? autoX100 / 100 : undefined });
  };
  const take = () => {
    setActedIn(view.roundId);
    bet.reset();
    cash.mutate();
  };

  let main: ReactNode;
  if (canCash) {
    main = (
      <Button variant="none" className="jpg-go jpg-cash" disabled={cash.isPending} onClick={take}>
        {t('cashout')}{' '}
        <span ref={live} className="n">
          {me.amount.toLocaleString()}
        </span>
      </Button>
    );
  } else if (open) {
    main = (
      <Button variant="none" className="jpg-go" disabled={!amountOk || !autoOk || bet.isPending} onClick={place}>
        {t('bet')}
      </Button>
    );
  } else {
    main = (
      <Button variant="none" className="jpg-go" disabled>
        {statusOf(view, t)}
      </Button>
    );
  }

  return (
    <div className="jpg-panel">
      <div className="jpg-fields">
        <Field label={t('amount')}>
          {(id) => (
            <div className="jpg-row">
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={minBet}
                max={maxBet}
                step={1}
                value={amount}
                disabled={!open}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={!amountOk || undefined}
              />
              <Button variant="none" className="jpg-mini" disabled={!open} onClick={() => setN(n / 2)}>
                {t('half')}
              </Button>
              <Button variant="none" className="jpg-mini" disabled={!open} onClick={() => setN(n * 2)}>
                {t('double')}
              </Button>
            </div>
          )}
        </Field>
        <Field label={t('auto')}>
          {(id) => (
            <div className="jpg-row">
              <Button
                variant="none"
                className={cn('jpg-toggle', autoOn && 'on')}
                aria-pressed={autoOn}
                aria-label={t('autoToggle')}
                disabled={!open}
                onClick={() => setAutoOn((v) => !v)}
              >
                <span className="jpg-dot" aria-hidden />
              </Button>
              <Input
                id={id}
                inputMode="decimal"
                value={auto}
                disabled={!open || !autoOn}
                onChange={(e) => setAuto(e.target.value)}
                suffix="x"
                aria-invalid={!autoOk || undefined}
              />
            </div>
          )}
        </Field>
      </div>
      {main}
      <p className="jpg-hint">
        {open && !amountOk
          ? t('amountInvalid', { min: minBet, max: maxBet })
          : open && !autoOk
            ? t('autoInvalid', { min: formatX(minAutoX100), max: formatX(maxAutoX100) })
            : t('balance', { n: (coins?.balance ?? 0).toLocaleString() })}
      </p>
      <ErrorNote error={error} fallback={t('actionFailed')} />
    </div>
  );
}

function statusOf(view: JetpackView, t: ReturnType<typeof useTranslations<'jetpack'>>) {
  const me = view.me;
  if (view.phase === 'betting' && me) return t('betPlaced', { n: me.amount.toLocaleString() });
  if (me && me.cashoutX100 !== null && me.payout !== null) {
    return view.phase === 'crashed'
      ? t('won', { n: (me.payout - me.amount).toLocaleString() })
      : t('cashedOut', { n: me.payout.toLocaleString(), x: formatX(me.cashoutX100) });
  }
  if (view.phase === 'crashed' && me) return t('lost', { n: me.amount.toLocaleString() });
  if (view.phase === 'crashed') return t('roundOver');
  if (view.phase === 'flying') return t('nextRound');
  return t('waiting');
}
