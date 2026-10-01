'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useCoinBalance } from '@/entities/coins';
import { useJetpackBet, useJetpackCashout, type JetpackView } from '@/entities/jetpack';
import { cn } from '@/shared/lib/utils/css';
import { Button } from '@/shared/ui/Button';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Input } from '@/shared/ui/Field';
import { formatX, payout, x100At } from '../lib/flight';
import { chipLabel, chipsFor, stepBet } from '../lib/stake';
import { useFrames } from '../model/useFrames';

const AUTO_RE = /^\d+(\.\d{1,2})?$/;

/**
 * Ставка на раунд. Сверху — автоставка, автовывод и его множитель; слева —
 * сумма с шагом − / + и быстрыми суммами; справа — одна главная кнопка по
 * состоянию: «Поставить» → «Ставка принята» → «Забрать N» → итог раунда.
 * Сумма «Забрать» растёт с множителем и пишется в DOM каждым кадром; сервер
 * всё равно считает вывод по времени прихода запроса, а клиент отстаёт от его
 * часов на задержку сети — забранное не меньше показанного.
 *
 * Поля заперты, только пока своя ставка в игре: в полёте без ставки следующую
 * можно готовить заранее — с автоставкой она уйдёт в следующем окне.
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
  const [autoBet, setAutoBet] = useState(false);
  const [autoOn, setAutoOn] = useState(false);
  const [auto, setAuto] = useState('2.00');
  const [actedIn, setActedIn] = useState<string | null>(null);
  const live = useRef<HTMLSpanElement>(null);
  /** Раунд, в котором ставка уже уходила: автоставка второй раз в том же окне не ставит. */
  const tried = useRef<string | null>(null);

  const { minBet, maxBet, minAutoX100, maxAutoX100 } = view.limits;
  const me = view.me;
  const n = Number(amount);
  const amountOk = Number.isInteger(n) && n >= minBet && n <= maxBet && n <= (coins?.balance ?? Infinity);
  const autoX100 = AUTO_RE.test(auto) ? Math.round(Number(auto) * 100) : NaN;
  const autoOk = !autoOn || (autoX100 >= minAutoX100 && autoX100 <= maxAutoX100);
  const open = view.phase === 'betting' && !me;
  const locked = !!me && view.phase !== 'crashed';
  const canCash = view.phase === 'flying' && !!me && me.cashoutX100 === null;
  const error = actedIn === view.roundId ? (bet.error ?? cash.error) : null;

  useFrames(canCash, () => {
    if (!live.current || !me || view.launchedAt === null) return;
    const x = Math.min(x100At(Date.now() + view.offset - view.launchedAt, view.rate), me.autoX100 ?? Infinity);
    live.current.textContent = payout(me.amount, x).toLocaleString();
  });

  // Автоставка: открылось окно, своей ставки нет — уходит то, что в полях.
  // Ставка — побочный эффект, поэтому эффект, а не расчёт в рендере; раунд
  // отмечается рефом, а состояние меняют колбэки мутации — синхронный setState
  // в теле эффекта запрещён правилом React Compiler.
  const { mutate: sendBet } = bet;
  const { reset: resetCash } = cash;
  const autoReady = autoBet && open && amountOk && autoOk && !bet.isPending;
  useEffect(() => {
    if (!autoReady || tried.current === view.roundId) return;
    const round = view.roundId;
    tried.current = round;
    resetCash();
    sendBet(
      { amount: n, autoCashout: autoOn ? autoX100 / 100 : undefined },
      {
        onSettled: () => setActedIn(round),
        // Отказ (не хватило монет, окно закрылось) снимает автоставку: иначе
        // она повторяла бы ту же ошибку каждый раунд.
        onError: () => setAutoBet(false),
      },
    );
  }, [autoReady, view.roundId, n, autoOn, autoX100, sendBet, resetCash]);

  const place = () => {
    tried.current = view.roundId;
    setActedIn(view.roundId);
    cash.reset();
    bet.mutate({ amount: n, autoCashout: autoOn ? autoX100 / 100 : undefined });
  };
  const take = () => {
    setActedIn(view.roundId);
    bet.reset();
    cash.mutate();
  };
  const setN = (v: number) => setAmount(String(v));

  let main: ReactNode;
  if (canCash) {
    main = (
      <Button variant="none" className="jpg-go jpg-act jpg-cash" disabled={cash.isPending} onClick={take}>
        {t('cashout')}{' '}
        <span ref={live} className="n">
          {me.amount.toLocaleString()}
        </span>
      </Button>
    );
  } else if (open) {
    main = (
      <Button variant="none" className="jpg-go jpg-act" disabled={!amountOk || !autoOk || bet.isPending} onClick={place}>
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

  const hint = !locked && !amountOk
    ? t('amountInvalid', { min: minBet, max: maxBet })
    : !locked && !autoOk
      ? t('autoInvalid', { min: formatX(minAutoX100), max: formatX(maxAutoX100) })
      : null;

  return (
    <div className="jpg-panel">
      <div className="jpg-opts">
        <Check on={autoBet} onToggle={() => setAutoBet((v) => !v)}>
          {t('autoBet')}
        </Check>
        <Check on={autoOn} disabled={locked} onToggle={() => setAutoOn((v) => !v)}>
          {t('auto')}
        </Check>
        <Input
          className="jpg-target n"
          aria-label={t('autoTarget')}
          inputMode="decimal"
          prefix="x"
          value={auto}
          disabled={locked || !autoOn}
          onChange={(e) => setAuto(e.target.value)}
          aria-invalid={!autoOk || undefined}
        />
      </div>
      <div className="jpg-stake">
        <div className="jpg-amount">
          <Button
            variant="none"
            className="jpg-step"
            aria-label={t('less')}
            disabled={locked}
            onClick={() => setN(stepBet(n, -1, minBet, maxBet))}
          >
            −
          </Button>
          <label className="jpg-sum">
            <Input
              className="n"
              aria-label={t('amount')}
              inputMode="numeric"
              value={amount}
              disabled={locked}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
              aria-invalid={!amountOk || undefined}
            />
            <CoinIcon className="jpg-unit" />
          </label>
          <Button
            variant="none"
            className="jpg-step"
            aria-label={t('more')}
            disabled={locked}
            onClick={() => setN(stepBet(n, 1, minBet, maxBet))}
          >
            +
          </Button>
        </div>
        <div className="jpg-chips">
          {chipsFor(minBet, maxBet).map((c) => (
            <Button
              key={c}
              variant="none"
              className={cn('jpg-chip n', n === c && 'on')}
              aria-pressed={n === c}
              disabled={locked}
              onClick={() => setN(c)}
            >
              {chipLabel(c)}
            </Button>
          ))}
        </div>
      </div>
      {main}
      {hint && <p className="jpg-hint">{hint}</p>}
      <ErrorNote error={error} fallback={t('actionFailed')} />
    </div>
  );
}

/** Флажок с подписью — кнопка-переключатель: весь блок кликабелен, состояние — `aria-pressed`. */
function Check({
  on,
  disabled,
  onToggle,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Button variant="none" className={cn('jpg-check', on && 'on')} aria-pressed={on} disabled={disabled} onClick={onToggle}>
      <span className="jpg-box" aria-hidden>
        {on && (
          <svg viewBox="0 0 12 12">
            <path d="M2.5 6.2 5 8.6l4.5-5" />
          </svg>
        )}
      </span>
      {children}
    </Button>
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
