'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useBattlePass } from '@/entities/battle-pass';
import { DonateDialog, useDonationConfig } from '@/features/donation';
import { Button } from '@/shared/ui/Button';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { Skeleton } from '@/shared/ui/Skeleton';

/**
 * Низ витрины — как устроены монеты, на которые идут все игры. Единственное,
 * что раздел обязан объяснить словами: он стоит в одном продукте с настоящим
 * журналом сделок, и спутать монеты с деньгами счёта можно ровно один раз.
 *
 * Здесь раньше стояли полоса «одна платформа» с картинкой и итоги «4 игры ·
 * ∞ возможностей · 1 сообщество» — реклама раздела внутри самого раздела, и
 * числа, которые ничего не сообщали. Сняты 2026-10-01.
 *
 * Четыре клетки — та же сетка, что у карточек: откуда монеты берутся (каждый
 * день, за сезон, покупкой) и чего с ними нельзя (вывести). Суммы — с
 * сервера (неделя ежедневной награды, лестница сезона, курс доната), а не
 * копией во фронте: вторая копия разошлась бы с первой при первой правке.
 */
export function CoinsInfo() {
  const t = useTranslations('games.coins');
  const format = useFormatter();
  const bp = useBattlePass();
  const donation = useDonationConfig();
  const [donateOpen, setDonateOpen] = useState(false);

  const n = (v: number) => format.number(v);
  const week = bp.data?.daily.week;
  const season = bp.data?.levels.reduce((sum, row) => sum + row.coins, 0);
  const rate = donation.data?.coinsPerUsdt;

  return (
    <section className="gcoins">
      <header className="gcoins-head">
        <p className="gkicker">{t('kicker')}</p>
        <h2>{t('title')}</h2>
      </header>

      <div className="gcoins-grid">
        <Cell label={t('daily.label')} note={t('daily.note')} loading={bp.isLoading}>
          {week?.length ? (
            <>
              +{n(week[0])} → +{n(week[week.length - 1])} <CoinIcon />
            </>
          ) : null}
        </Cell>

        <Cell
          label={t('season.label')}
          note={t('season.note')}
          loading={bp.isLoading}
          action={
            <Link href="/profile" className="gcoins-link">
              {t('season.action')} <span aria-hidden>→</span>
            </Link>
          }
        >
          {season ? (
            <>
              {t('season.upTo')} {n(season)} <CoinIcon />
            </>
          ) : null}
        </Cell>

        <Cell
          label={t('buy.label')}
          note={donation.data && !donation.data.enabled ? t('buy.off') : t('buy.note')}
          loading={donation.isLoading}
          action={
            donation.data?.enabled ? (
              <Button onClick={() => setDonateOpen(true)}>
                {t('buy.action')}
              </Button>
            ) : null
          }
        >
          {rate ? (
            <>
              {n(rate)} <CoinIcon /> <small>{t('buy.per')}</small>
            </>
          ) : null}
        </Cell>

        <Cell label={t('withdraw.label')} note={t('withdraw.note')}>
          {t('withdraw.value')}
        </Cell>
      </div>

      <DonateDialog open={donateOpen} onClose={() => setDonateOpen(false)} />
    </section>
  );
}

/**
 * Клетка: подпись, крупное значение, пояснение, необязательное действие.
 * Сверху — лампа того же вида, что софиты над карточками, но белая: у монет
 * нет игры, и цвет одной из них был бы здесь чужим.
 */
function Cell({
  label,
  note,
  loading,
  action,
  children,
}: {
  label: string;
  note: string;
  loading?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="gcoins-cell">
      <i className="gcoins-lamp" aria-hidden />
      <p className="gcoins-label">{label}</p>
      <p className="gcoins-value">{loading ? <Skeleton as="span" inline width={120} height={28} /> : (children ?? '—')}</p>
      <p className="gcoins-note">{note}</p>
      {action && <div className="gcoins-action">{action}</div>}
    </div>
  );
}
