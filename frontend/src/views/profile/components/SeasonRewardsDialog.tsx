'use client';

import { useCallback, useState, type CSSProperties } from 'react';
import { Check, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useClaimRewards, type BattlePassState } from '@/entities/battle-pass';
import { useLocaleControl } from '@/shared/i18n';
import { useRollingNumber } from '@/shared/lib/hooks/useRollingNumber';
import { cn } from '@/shared/lib/utils/css';
import { Button } from '@/shared/ui/Button';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, useDialogFade } from '@/shared/ui/dialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { RewardBurst } from '@/shared/ui/RewardBurst';
import { RewardItem, rewardItemOf, type RewardItemKind } from '@/shared/ui/RewardItem';
import { int } from '../lib/format';
import { XpBar } from './XpBar';

/** Каждый такой уровень — сундук: веха, до которой хочется дойти. */
const MILESTONE = 10;

/** Пауза между салютами соседних карточек при выдаче, мс. */
const BURST_STEP = 90;

/**
 * Награды сезона — игровое окно в фиолетовом и мадженте: медаль уровня с
 * лучами, полоса опыта и лента всех пятидесяти уровней. Карточка уровня —
 * предмет по размеру награды (монета, стопка, горка), каждый десятый — сундук;
 * под лентой — путь с узлами, пройденные светятся. Плоские карточки с числом
 * были тусклыми и скучными (владелец 2026-10-01).
 *
 * Кнопка одна на всё доступное, а не на каждой карточке: награда одного вида
 * — монеты, и выбирать, какую получить раньше, незачем. Срок сезона стоит в
 * шапке окна, рядом с кнопкой: незабранное сгорает вместе с сезоном.
 */
export function SeasonRewardsDialog({ state, onClose }: { state: BattlePassState; onClose: () => void }) {
  const t = useTranslations('profile');
  const { locale } = useLocaleControl();
  const claim = useClaimRewards();
  const { closing, close } = useDialogFade(onClose);
  // От какого `claimedLevel` ушла выдача. Пока перечитка Battle Pass не
  // пришла, карточки «готово» уже забраны, а кнопка не должна звать снова;
  // пришла — `claimedLevel` другой, и решают снова данные сервера.
  const [sentFrom, setSentFrom] = useState<number | null>(null);
  const inFlight = sentFrom === state.claimedLevel;
  // Какие уровни разлетаются монетами и в каком порядке — снимок на момент
  // выдачи: после перечитки они уже `claimed`, а салют должен доиграть на них.
  const [burst, setBurst] = useState<Map<number, number>>(new Map());

  const endsAt = new Date(state.season.endsAt).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  // Лента открывается на текущем уровне, а не на втором: с тридцатого уровня
  // пролистывать к себе двадцать восемь карточек — лишний жест на каждый заход.
  // Реф-функцией, а не эффектом: портал Radix монтирует содержимое окна на
  // проход позже, и эффект этого компонента видел бы ещё пустой реф. Без
  // зависимостей — вызывается один раз на монтирование ленты, и перечитка
  // после выдачи не отматывает то, что человек пролистал сам.
  const track = useCallback((list: HTMLOListElement | null) => {
    const cur = list?.querySelector<HTMLElement>('[data-current]');
    if (list && cur) list.scrollLeft = cur.offsetLeft - list.clientWidth / 2 + cur.offsetWidth / 2;
  }, []);

  const onClaim = () => {
    const from = state.claimedLevel;
    claim.mutate(undefined, {
      onSuccess: () => {
        setSentFrom(from);
        const ready = state.levels.filter((r) => r.state === 'ready').map((r) => r.level);
        setBurst(new Map(ready.map((level, i) => [level, i])));
      },
    });
  };

  const pending = inFlight ? 0 : state.pendingCoins;
  // Сумма в кнопке после выдачи не пропадает, а отсчитывается до нуля.
  const shown = useRollingNumber(pending);
  // Лента наводится на ближайший уровень впереди; на потолке — на последний.
  const focus = Math.min(state.level + 1, state.levels[state.levels.length - 1]?.level ?? 0);
  const maxCoins = Math.max(0, ...state.levels.filter((r) => r.level % MILESTONE !== 0).map((r) => r.coins));
  // Сундук — только у вех: самая крупная из обычных наград остаётся горкой.
  const itemOf = (level: number, coins: number): RewardItemKind => {
    if (level % MILESTONE === 0) return 'chest';
    const kind = rewardItemOf(coins, maxCoins);
    return kind === 'chest' ? 'pile' : kind;
  };

  return (
    <Dialog open={!closing} onOpenChange={(v) => !v && close()}>
      <DialogContent tone="game" wide className="dlg-reward dlg-season">
        <DialogHeader
          title={t('track')}
          subtitle={t('seasonNote')}
          aside={<span className="rw-ends">{t('seasonEnds', { date: endsAt })}</span>}
        />
        <DialogBody>
          <div className="rw-level">
            <div className="rw-medal-wrap" aria-hidden>
              <span className="rw-rays" />
              <div className="rw-medal">
                <span className="rw-medal-lbl">{t('lvl')}</span>
                <span className="rw-medal-n n">{state.level}</span>
              </div>
            </div>
            <div className="rw-level-r">
              <XpBar state={state} />
              {shown > 0 && (
                <p className="rw-pending n">
                  {t('seasonPending')} <strong>+{int(shown)}</strong> <CoinIcon />
                </p>
              )}
            </div>
          </div>
          <ol className="rw-track" ref={track}>
            {state.levels.map((row) => {
              const claimed = row.state === 'claimed' || (inFlight && row.state === 'ready');
              const ready = row.state === 'ready' && !claimed;
              const order = burst.get(row.level);
              return (
                <li
                  key={row.level}
                  className={cn(
                    'rw-lv',
                    claimed && 'is-claimed',
                    ready && 'is-ready',
                    row.state === 'locked' && 'is-locked',
                    row.level % MILESTONE === 0 && 'is-milestone',
                    order != null && 'is-bursting',
                  )}
                  style={order != null ? ({ '--bd': `${order * BURST_STEP}ms` } as CSSProperties) : undefined}
                  data-current={row.level === focus || undefined}
                >
                  <span className="rw-lv-n n">{row.level}</span>
                  <RewardItem kind={itemOf(row.level, row.coins)} open={claimed && row.level % MILESTONE === 0} />
                  <span className="rw-lv-c n">
                    {int(row.coins)} <CoinIcon />
                  </span>
                  <span className="rw-lv-s">
                    {claimed ? (
                      <Check aria-label={t('claimed')} size={13} strokeWidth={3} />
                    ) : ready ? (
                      t('ready')
                    ) : (
                      <>
                        <Lock aria-hidden size={10} />
                        <span className="n">{int(row.xp)}</span>
                      </>
                    )}
                  </span>
                  <span className="rw-node" aria-hidden />
                  {order != null && <RewardBurst coins={row.coins} delay={order * BURST_STEP} />}
                </li>
              );
            })}
          </ol>
        </DialogBody>
        <DialogFooter className="df-solo">
          {shown > 0 ? (
            <Button variant="solid" className="rw-claim" disabled={claim.isPending || inFlight} onClick={onClaim}>
              {t('claimPlus', { coins: int(shown) })}
              <CoinIcon />
            </Button>
          ) : (
            <Button variant="solid" onClick={close}>
              {t('done')}
            </Button>
          )}
        </DialogFooter>
        <ErrorNote error={claim.error} fallback={t('claimFailed')} />
      </DialogContent>
    </Dialog>
  );
}
