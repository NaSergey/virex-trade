import { PokerTablePage } from '@/views/poker-table/Page';

/** Покерный стол — /games/poker/<id>. Ссылка на него же и приглашение за закрытый стол. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PokerTablePage id={id} />;
}
