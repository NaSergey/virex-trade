'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { GameTableRow } from '@/entities/game-table';
import { Button } from '@/shared/ui/Button';
import { PageHead } from '@/shared/ui/PageHead';
import { Wrap } from '@/shared/ui/Wrap';
import { TablesList } from '@/widgets/card-table';
import { CreateTableDialog } from './components/CreateTableDialog';

/** Ставки стола блэкджека в строке списка — лимиты на руку. */
const limits = (x: GameTableRow) => `${x.minBet ?? 0}–${x.maxBet ?? 0}`;

/**
 * Блэкджек — лобби игры: мои столы и свободные чужие, создание окном из кнопки
 * у заголовка, как у покера.
 *
 * Садятся не здесь, а за самим столом — кликом по пустому месту: игрок сначала
 * видит, кто уже сидит, и только потом решает, на сколько.
 */
export function BlackjackLobbyPage() {
  const t = useTranslations('blackjack');
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const open = (id: string) => router.push(`/games/blackjack/${id}`);
  const stakes = { header: t('colBets'), render: limits };

  return (
    <Wrap page>
      <PageHead title={t('title')}>
        <Button variant="solid" onClick={() => setCreateOpen(true)}>
          {t('createAction')}
        </Button>
      </PageHead>
      <div className="lists">
        <TablesList gameType="blackjack" kind="mine" onOpen={open} stakes={stakes} />
        <TablesList gameType="blackjack" kind="public" onOpen={open} stakes={stakes} />
      </div>
      <CreateTableDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={open} />
    </Wrap>
  );
}
