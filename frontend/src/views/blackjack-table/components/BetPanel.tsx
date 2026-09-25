'use client';

import { useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { ChipStack, DENOMS } from '@/widgets/card-table';

/**
 * Ставка в открытое окно: фишки номиналов складываются в сумму, «Поставить»
 * отправляет её. Каждая фишка летит на стол (`onChip` получает кнопку — от неё
 * начинается полёт), поэтому сумма живёт у страницы, а не здесь: ту же сумму
 * показывает ставка на сукне. Номиналы — не выше того, что можно поставить
 * (максимум стола и стек). В окне сумма начинается с нуля, и «Очистить» до
 * первой фишки неактивна — очищать нечего. Поставленное можно переставить,
 * пока окно открыто; полоса над фишками — сколько ему осталось (у одного за
 * столом срока нет, и полосы тоже).
 */
export function BetPanel({
  min,
  cap,
  draft,
  placed,
  deadline,
  timerMs,
  pending,
  onChip,
  onClear,
  onBet,
}: {
  min: number;
  /** Больше не поставить: максимум стола или стек. */
  cap: number;
  draft: number;
  placed: number | null;
  deadline: number | null;
  timerMs: number;
  pending: boolean;
  onChip: (amount: number, from: Element) => void;
  onClear: () => void;
  onBet: (amount: number) => void;
}) {
  const t = useTranslations('blackjack');
  const denoms = [...DENOMS].reverse().filter((d) => d <= cap);
  const ok = draft >= min && draft <= cap;

  return (
    <div className="bj-bet">
      {deadline && <Countdown key={deadline} deadline={deadline} ms={timerMs} />}
      <div className="bj-chips">
        {denoms.map((d) => (
          <Button
            key={d}
            variant="none"
            className="bj-chip"
            disabled={draft >= cap}
            onClick={(e) => onChip(d, e.currentTarget)}
          >
            <ChipStack amount={d} max={1} width={34} />
            <span className="n">{d.toLocaleString()}</span>
          </Button>
        ))}
      </div>
      <div className="bj-bet-row">
        <Button variant="none" className="ct-act" disabled={draft === 0} onClick={onClear}>
          {t('clear')}
        </Button>
        <span className="bj-draft n">{draft.toLocaleString()}</span>
        <Button variant="none" className="ct-act" disabled={!ok || pending} onClick={() => onBet(draft)}>
          {placed ? t('rebet') : t('placeBet')}
        </Button>
      </div>
      {placed ? <p className="fhint">{t('betPlaced', { n: placed })}</p> : null}
    </div>
  );
}

/**
 * Сколько осталось окну ставок. Часы читаются один раз, при монтаже: сервер
 * присылает крайний срок, и полоса начинается не с полной, а с того места,
 * где окно уже находится (тот же приём, что дуга хода у места).
 */
function Countdown({ deadline, ms }: { deadline: number; ms: number }) {
  const [now] = useState(() => Date.now());
  const style = {
    '--bj-ms': `${ms}ms`,
    animationDelay: `${-Math.max(0, ms - (deadline - now))}ms`,
  } as CSSProperties;
  return (
    <div className="bj-countdown" aria-hidden>
      <span style={style} />
    </div>
  );
}
