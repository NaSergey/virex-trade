import { TournamentTerminalPage } from '@/views/tournament-terminal/Page';

/**
 * Торговля в турнире — /games/trading/<id>. Сам турнир живёт окном на витрине
 * (`/games/trading?t=<id>`), туда же ведёт и ссылка-приглашение; здесь только
 * терминал, которому нужен весь экран.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TournamentTerminalPage id={id} />;
}
