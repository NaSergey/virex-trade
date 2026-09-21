'use client';

import { useTranslations } from 'next-intl';
import type { TournamentDetail, TournamentPlayer } from '@/entities/tournament';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { SectionHead } from '@/shared/ui/SectionHead';

/**
 * Состав турнира со сводкой по каждому.
 *
 * Показывается только то, что посчитано по ЗАКРЫТЫМ сделкам: ни направлений,
 * ни открытых позиций. Сторона чужой открытой сделки — готовая подсказка, и
 * турнир превратился бы в соревнование по подглядыванию; закрытая сделка уже
 * ничего не подсказывает, а сравнить себя с другими даёт.
 *
 * Поэтому «Результат» здесь — не эквити и не место: открытое в него не входит,
 * и человек, сидящий в плюсовой позиции, в этой таблице его не показывает. Об
 * этом сказано подписью под таблицей, иначе колонку прочитают как турнирную
 * таблицу, которой она не является.
 *
 * В лобби сессий ещё нет, считать нечего — там остаётся список имён с одной
 * отметкой: кто уже готов начать. Она и есть весь смысл лобби — турнир
 * стартует сам, когда отмечены все, и человек должен видеть, кого ждут.
 */
export function Participants({ detail }: { detail: TournamentDetail }) {
  const t = useTranslations('tournaments');
  const lobby = detail.tournament.status === 'lobby';

  if (lobby) {
    return (
      <section className="tsect">
        <SectionHead title={t('participantsTitle')} />
        <ul className="players">
          {detail.participants.map((p) => (
            <li key={p.userId}>
              {p.name ?? '—'}
              <span className="pstate" data-r={p.ready}>
                {p.ready ? t('ready') : t('notReady')}
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const columns: LedgerColumn<TournamentPlayer>[] = [
    { key: 'name', header: t('colPlayer'), render: (p) => p.name ?? '—' },
    {
      key: 'trades',
      header: t('colClosedTrades'),
      align: 'right',
      cellClassName: 'n',
      render: (p) => p.stats?.trades ?? 0,
    },
    {
      key: 'winRate',
      header: t('colWinRate'),
      align: 'right',
      cellClassName: 'n',
      // Без сделок винрейт не «ноль процентов», а неизвестен: ноль читался бы
      // как «всё слил», хотя человек просто ещё не закрыл ни одной.
      render: (p) => (p.stats && p.stats.trades > 0 ? `${Math.round(p.stats.winRate)}%` : '—'),
    },
    {
      key: 'pnl',
      header: t('colClosedPnl'),
      align: 'right',
      cellClassName: 'n',
      render: (p) => (p.stats && p.stats.trades > 0 ? <Money value={p.stats.pnl} /> : '—'),
    },
  ];

  return (
    <section className="tsect">
      <SectionHead title={t('participantsTitle')} />
      <LedgerTable columns={columns} rows={detail.participants} rowKey={(p) => p.userId} />
    </section>
  );
}
