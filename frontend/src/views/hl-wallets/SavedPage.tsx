'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/features/auth';
import { Wrap } from '@/shared/ui/Wrap';
import { PageHead } from '@/shared/ui/PageHead';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Button } from '@/shared/ui/Button';
import { Seg } from '@/shared/ui/Seg';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { dateFormat } from '@/shared/lib/utils/intl';
import { useHlPositions, useHlSaved, useSaveWallet, useStarWallet, type HlWalletRow } from './api/hooks';
import { pct } from './model/format';
import { walletColumns } from './components/walletColumns';
import { useDetailsColumn } from './components/useDetailsColumn';
import { groupByCoin } from './model/coins';
import { CoinsTable } from './components/CoinsTable';
import { WalletDetail } from './components/WalletDetail';
import { AddWalletForm } from './components/AddWalletForm';

/**
 * Кошельки, которые владелец взял в работу: та же статистика и причина, если
 * кошелёк выпал из отбора. Строка раскрывается заметкой и вкладками «Позиции /
 * Ордера / История сделок». Ниже — общие монеты всех сохранённых кошельков и
 * направление, в которое они смотрят вместе.
 *
 * Затемнения «просмотрено», как в общей таблице, здесь нет: сохранённый
 * кошелёк — тот, с которым работают, и гаснуть ему незачем.
 */
export function HlSavedPage() {
  const t = useTranslations('hlWallets');
  const locale = useLocale();
  const { user, loading: authLoading } = useAuth();
  const enabled = !!user?.isAdmin;
  const saved = useHlSaved(enabled);
  const positions = useHlPositions(enabled);
  const { unsave } = useSaveWallet();
  const star = useStarWallet();
  const details = useDetailsColumn();

  // Причина выпадения важнее «не торгует»: она говорит, почему кошелёк больше
  // не годится, а мёртвый кошелёк в отборе — уже следствие.
  const statusOf = (r: HlWalletRow) => {
    if (!r.analyzedAt) return t('pending');
    if (r.qualified) return r.alive ? t('inSelection') : t('dead');
    switch (r.rejectReason) {
      case 'weeksUp':
        return t('reason.weeksUp', { share: pct(r.weeksMoving ? (r.weeksUp ?? 0) / r.weeksMoving : 0) });
      case 'oneSpike':
        return t('reason.oneSpike', { share: pct(r.bestWeekShare) });
      case 'drawdown':
        return t('reason.drawdown', { share: pct(r.maxDrawdown) });
      default:
        return t(`reason.${r.rejectReason ?? 'noData'}`);
    }
  };

  const status: LedgerColumn<HlWalletRow> = {
    key: 'status',
    header: t('colStatus'),
    render: (r) => <span className={r.qualified && r.alive ? undefined : 'muted'}>{statusOf(r)}</span>,
  };
  // Звезда — «этому кошельку доверяю»: залитая у отмеченных, они же стоят в таблице первыми.
  const starCol: LedgerColumn<HlWalletRow> = {
    key: 'star',
    width: 28,
    cellClassName: 'pin-cell',
    noSkeleton: true,
    render: (r) => (
      <Button
        variant="none"
        className="pin"
        aria-pressed={r.starred}
        aria-label={r.starred ? t('unstarWallet') : t('starWallet')}
        title={r.starred ? t('unstarTitle') : t('starTitle')}
        // Строка раскрывается по клику, и звезда не должна её раскрывать.
        onClick={(e) => {
          e.stopPropagation();
          star.mutate({ address: r.address, starred: !r.starred });
        }}
      >
        {r.starred ? '★' : '☆'}
      </Button>
    ),
  };
  // Первой колонкой, а не последней: таблица широкая, и крайняя справа кнопка
  // уезжала за край экрана вместе с горизонтальной прокруткой.
  const remove: LedgerColumn<HlWalletRow> = {
    key: 'remove',
    noSkeleton: true,
    width: 90,
    render: (r) => (
      <Button
        variant="bare"
        tight
        // Строка раскрывается по клику, и «Убрать» не должно её раскрывать.
        onClick={(e) => {
          e.stopPropagation();
          unsave.mutate(r.address);
        }}
        disabled={unsave.isPending && unsave.variables === r.address}
      >
        {t('remove')}
      </Button>
    ),
  };

  const [scope, setScope] = useState<'all' | 'directional'>('all');
  const snap = positions.data;
  // Монеты, которые держат хотя бы два сохранённых кошелька: монета одного
  // кошелька — его личное дело, она видна в раскрытии самой строки.
  // По умолчанию — все; «направленные» убирают кошельки, у которых лонг и шорт гасят
  // друг друга: их ноги по отдельным монетам — не мнение о рынке.
  const hedged = new Set((saved.data?.rows ?? []).filter((r) => r.style === 'neutral').map((r) => r.address));
  const coins = groupByCoin(
    (snap?.positions ?? []).filter((p) => scope === 'all' || !hedged.has(p.address)),
  );
  const posLoading = authLoading || positions.isLoading;

  return (
    <Wrap page className="hl-page">
      <PageHead title={t('savedTitle')} lede={t('savedLede')} />
      <AddWalletForm />
      <ErrorNote error={saved.error ?? unsave.error ?? star.error} fallback={t('loadFailed')} />
      <div className="hlw">
        <LedgerTable
          columns={walletColumns(t, [starCol, remove], [status, details.column])}
          rowClassName={details.rowClass}
          rows={saved.data?.rows ?? []}
          rowKey={(r) => r.address}
          minWidth={1400}
          // Пока восстанавливается сессия, запрос ещё выключен — без authLoading
          // таблица на перезагрузке мигала бы «ничего не сохранено».
          isLoading={authLoading || saved.isLoading}
          empty={t('savedEmpty')}
          renderExpanded={(r) => (
            <WalletDetail row={r} positions={snap?.positions ?? []} positionsLoading={posLoading} />
          )}
        />
      </div>

      <SectionHead title={t('positions')} style={{ marginTop: 'var(--s5)' }}>
        {snap ? (
          <span className="lbl">
            {t('asOf', { at: dateFormat(locale, { timeStyle: 'medium' }).format(new Date(snap.asOf)) })}
          </span>
        ) : null}
      </SectionHead>
      <ErrorNote error={positions.error} fallback={t('loadFailed')} />
      {snap?.failed.length ? <p className="warn">{t('positionsFailed', { n: snap.failed.length })}</p> : null}
      <p className="muted">{t('commonCoinsLede')}</p>
      <div style={{ margin: 'var(--s2) 0 var(--s3)' }}>
        <Seg
          options={[
            { value: 'all', label: t('scopeAll') },
            { value: 'directional', label: t('scopeDirectional') },
          ]}
          value={scope}
          onChange={setScope}
          ariaLabel={t('scopeAria')}
        />
      </div>
      <CoinsTable rows={coins} isLoading={posLoading} />
    </Wrap>
  );
}
