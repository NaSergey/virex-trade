'use client';

import { useTranslations } from 'next-intl';
import type { TournamentStatus } from '@/entities/tournament';
import { countdown } from '../lib/countdown';
import { useCountdown } from '@/shared/lib/hooks/useCountdown';

/**
 * Состояние турнира значком — LIVE / OPEN / ENDED (образец владельца
 * 2026-09-26), латиницей в обеих локалях: это метка, а не фраза.
 *
 * У набора с назначенным временем рядом идёт отсчёт до старта: «когда
 * начнётся» — первое, что человек хочет знать о лобби по расписанию.
 * `long` — в шапке окна («Старт через …»), без него — в строке списка
 * («через …»), где слово «старт» уже сказано значком.
 */
export function TournamentBadge({
  status,
  startsAt,
  long = false,
}: {
  status: TournamentStatus;
  /** Нет — значок без отсчёта: в таблице турниров время стоит своей ячейкой. */
  startsAt?: string | null;
  long?: boolean;
}) {
  const t = useTranslations('tournaments');
  return (
    <span className="tbadge-row">
      <span className="tbadge" data-s={status}>
        {t(`badge.${status}`)}
      </span>
      {status === 'lobby' && startsAt && <StartCountdown startsAt={startsAt} long={long} />}
    </span>
  );
}

/**
 * Отсчёт отдельным узлом: он перерисовывается раз в секунду, и тикать должен
 * он один, а не значок и не строка списка вокруг.
 */
function StartCountdown({ startsAt, long }: { startsAt: string; long: boolean }) {
  const t = useTranslations('tournaments');
  const left = useCountdown(startsAt);
  const c = left == null ? null : countdown(left);

  // Время вышло, а статус ещё прежний: старт делает движок турниров на своём
  // тике, и до следующего опроса списка это честное «стартует».
  if (c == null) return <span className="tcount">{t('starting')}</span>;

  const time = typeof c === 'string' ? c : `${t('days', { n: c.days })} ${c.clock}`;
  return <span className="tcount">{t(long ? 'startsIn' : 'startsInShort', { time })}</span>;
}
