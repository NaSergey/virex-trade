'use client';

import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useBattlePass } from '@/entities/battle-pass';
import { useCountdown } from '@/shared/lib/hooks/useCountdown';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { Skeleton } from '@/shared/ui/Skeleton';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Первый экран раздела — рекламный баннер над карточками (владелец
 * 2026-10-17: лучи софитов сняты, на их место — реклама). Вместе с карточками
 * занимает ровно окно под шапкой (`.gfirst`) и забирает всё, что карточки
 * оставили.
 *
 * Рекламирует сезон и награды по образцу владельца — киберспортивный
 * баннер турнира: слева заголовок, живой отсчёт до конца сезона и кнопка,
 * справа на ровной светлой наклонной полосе (та же, что на профиле) — сколько
 * монет даёт сезон целиком и где игрок сейчас. Все числа — с сервера.
 *
 * Сняты владельцем, не возвращать: плашка с одним текстом, сцена свечей
 * турниров, лента наград с монетами и сундуками (`RewardItem`).
 */
export function GamesPromo() {
  const t = useTranslations('games.promo');
  const format = useFormatter();
  const bp = useBattlePass();
  const state = bp.data;

  const total = state?.levels.reduce((sum, row) => sum + row.coins, 0) ?? 0;
  const maxLevel = state?.levels.length ?? 0;
  const pct = state && maxLevel > 1 ? Math.min(100, ((state.level - 1) / (maxLevel - 1)) * 100) : 0;
  const pending = state?.pendingCoins ?? 0;

  return (
    <section className="gpromo">
      <i className="gpromo-band" aria-hidden />
      <div className="gpromo-in">
        <div className="gpromo-txt">
          <p className="gkicker">{state ? t('kicker', { key: state.season.key }) : t('kickerShort')}</p>
          <h2>{t('title')}</h2>
          <p className="gpromo-note">{t('note')}</p>
          <div className="gpromo-row">
            <Link href="/profile" className="btn solid gpromo-cta">
              {pending > 0 ? t('claim', { coins: format.number(pending) }) : t('action')}
            </Link>
            {state && <SeasonCountdown endsAt={state.season.endsAt} />}
          </div>
        </div>

        <div className="gpromo-prize">
          <p className="gpromo-prize-l">{t('prizeLabel')}</p>
          <p className="gpromo-prize-n">
            {state ? (
              <>
                {format.number(total)} <CoinIcon />
              </>
            ) : (
              <Skeleton as="span" inline width={180} height={56} />
            )}
          </p>
          {state && (
            <>
              <div className="gpromo-bar" role="presentation">
                <i style={{ width: `${pct}%` }} />
              </div>
              <p className="gpromo-prize-l">{t('level', { level: state.level, max: maxLevel })}</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Отсчёт до конца сезона — своим компонентом: тикает раз в секунду и
 * перерисовывает только себя, а не баннер.
 */
function SeasonCountdown({ endsAt }: { endsAt: string }) {
  const t = useTranslations('games.promo');
  const left = Math.max(0, useCountdown(endsAt) ?? 0);
  const s = Math.floor(left / 1000);
  const days = Math.floor(s / 86400);

  return (
    <div className="gpromo-clock">
      <span className="gpromo-clock-l">{t('endsIn')}</span>
      <span className="gpromo-clock-n">
        {days}
        <small>{t('days')}</small> {pad(Math.floor(s / 3600) % 24)}:{pad(Math.floor(s / 60) % 60)}:{pad(s % 60)}
      </span>
    </div>
  );
}
