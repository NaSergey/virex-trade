'use client';

import { useTranslations } from 'next-intl';
import type { TournamentDetail } from '@/entities/tournament';
import { SectionHead } from '@/shared/ui/SectionHead';

/**
 * Состав турнира — одни имена, без чисел. Пока турнир идёт, чужой результат не
 * показывается: у всех один график, и подсмотренное эквити соперника меняло бы
 * игру, а не отражало её.
 */
export function Participants({ detail }: { detail: TournamentDetail }) {
  const t = useTranslations('tournaments');
  return (
    <section>
      <SectionHead title={t('participantsTitle')} />
      <ul className="players">
        {detail.participants.map((p) => (
          <li key={p.userId}>{p.name ?? '—'}</li>
        ))}
      </ul>
    </section>
  );
}
