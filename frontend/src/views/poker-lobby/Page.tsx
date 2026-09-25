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

/** Ставки покерного стола в строке списка — блайнды. */
const blinds = (x: GameTableRow) => (x.bigBlind ? `${Math.floor(x.bigBlind / 2)}/${x.bigBlind}` : '—');

/**
 * Покер — лобби игры: мои столы и свободные чужие, создание окном из кнопки
 * у заголовка (тот же порядок, что у соревнования в торговле).
 *
 * Садятся не здесь, а за самим столом — кликом по пустому месту: игрок
 * сначала видит, с кем садится и какие там стеки, и только потом решает, на
 * сколько.
 */
export function PokerLobbyPage() {
  const t = useTranslations('poker');
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const open = (id: string) => router.push(`/games/poker/${id}`);
  const stakes = { header: t('colBlinds'), render: blinds };

  return (
    <Wrap page>
      <PageHead title={t('title')}>
        <Button variant="solid" onClick={() => setCreateOpen(true)}>
          {t('createAction')}
        </Button>
      </PageHead>
      <div className="lists">
        <TablesList gameType="poker" kind="mine" onOpen={open} stakes={stakes} />
        <TablesList gameType="poker" kind="public" onOpen={open} stakes={stakes} />
      </div>
      <CreateTableDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={open} />
    </Wrap>
  );
}
