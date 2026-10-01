'use client';

import { useTranslations } from 'next-intl';
import type { TournamentDetail } from '@/entities/tournament';
import { formatTradeDate } from '@/shared/lib/utils/format';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { MetricCell } from '@/shared/ui/MetricCell';

/**
 * Условия турнира одним взглядом — общей плотной строкой величин (`.metrics` /
 * `MetricCell`), той же, которой набраны сводки «Обзора» и «Рынка». Своей
 * вёрстки у турнира здесь нет намеренно: это ровно такой же ряд чисел с
 * подписями, и пары «подпись → значение» в две колонки (`.lookup`) читались
 * списком настроек, а не условиями игры.
 *
 * Без заголовка: турнир показывается окном, имя и состояние стоят в его шапке
 * — второй раз их не повторяем. Фонда в ряду тоже нет: он относится ко всему
 * окну, а не к его условиям, и стоит в шапке справа вместе с долями мест
 * (см. TournamentDialog).
 *
 * Конец турнира — подписью под длительностью, а не шестой величиной: это одно
 * и то же знание на двух уровнях («сколько идёт» и «когда кончится»), и в
 * лобби второго ещё не существует — турнир не начат. У лобби по времени на
 * этом месте стоит старт: он и задаёт, когда кончится.
 */
export function TournamentHead({ detail }: { detail: TournamentDetail }) {
  const t = useTranslations('tournaments');
  const { tournament: x } = detail;

  return (
    <div className="metrics metrics-4 tstats">
      <MetricCell label={t('colPlayers')} value={`${x.players}/${x.maxPlayers}`} />
      <MetricCell label={t('depositLabel')} value={`${x.startBalance.toLocaleString('ru-RU')} USDT`} />
      <MetricCell
        label={t('durationLabel')}
        value={t(`duration.${x.durationMin}`)}
        sub={
          x.endsAt
            ? `${t('endsAtLabel')} ${formatTradeDate(x.endsAt)}`
            : x.status === 'lobby' && x.startsAt
              ? `${t('startsAtLabel')} ${formatTradeDate(x.startsAt)}`
              : undefined
        }
      />
      <MetricCell
        label={t('colEntryFee')}
        value={
          x.entryFee > 0 ? (
            <>
              {x.entryFee} <CoinIcon />
            </>
          ) : (
            t('free')
          )
        }
      />
    </div>
  );
}
