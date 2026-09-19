import { TournamentPage } from '@/views/tournament/Page';

/**
 * Один турнир — /tournaments/trading/<id>. Этот же адрес и есть
 * ссылка-приглашение: id непрозрачный, отдельного инвайт-кода нет.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TournamentPage id={id} />;
}
