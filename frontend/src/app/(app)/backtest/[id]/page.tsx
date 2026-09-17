import { BacktestSessionPage } from '@/views/backtest/SessionPage';

/**
 * Сессия бектеста — /backtest/<id>
 *
 * Отдельный адрес, а не состояние страницы списка: иначе переход по шапке на
 * `/backtest` из открытой сессии не менял адрес (страница туда и так уже
 * указывала) и ничего не происходило.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BacktestSessionPage id={id} />;
}
