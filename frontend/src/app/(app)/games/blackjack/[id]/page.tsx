import { BlackjackTablePage } from '@/views/blackjack-table/Page';

/** Стол блэкджека — /games/blackjack/<id>. Ссылка на него же и приглашение за закрытый стол. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BlackjackTablePage id={id} />;
}
