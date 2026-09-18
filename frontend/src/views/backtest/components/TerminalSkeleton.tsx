import { Skeleton } from '@/shared/ui/Skeleton';

/**
 * Холст графика — заглушка на всю коробку родителя. Тот же `.replay-chart-wrap`,
 * что и у настоящего графика: раскладка одна, поэтому при появлении свечей
 * ничего не сдвигается.
 */
export function ChartSkeleton() {
  return (
    <div className="replay-chart-wrap">
      <Skeleton className="skel-canvas skel-fill" />
    </div>
  );
}

/**
 * Экран сессии до прихода данных: те же классы и та же сетка, что у
 * терминала (`ActiveSession`), — линейка ТФ, полоса инструментов, график,
 * тикет и строка кнопок стоят там, где встанут настоящие.
 *
 * Раньше здесь была одна полоса в 380px внутри читательской колонки: она не
 * совпадала ни с шириной, ни с высотой терминала, и когда сессия загружалась,
 * весь экран перестраивался. Мерки заглушек — по настоящим элементам
 * (кнопка ≈ 32px, деление тумблера ≈ 32px, иконка инструмента 30px).
 */
export function TerminalSkeleton() {
  return (
    <div className="bt-live px-4" aria-busy="true">
      <div className="asym terminal">
        <div className="terminal-main">
          <div className="terminal-chart">
            <div className="h2row">
              <Skeleton width={272} height={32} flush />
              <Skeleton width={30} height={32} flush />
            </div>
            <div className="chart-tools">
              <div className="draw-bar">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} width={30} height={30} flush />
                ))}
              </div>
              <div className="chart-tools-main">
                <ChartSkeleton />
              </div>
            </div>
          </div>
          <div className="terminal-controls">
            <div className="replay-controls">
              <Skeleton width={84} height={32} flush />
              <Skeleton width={300} height={32} flush />
              <Skeleton width={84} height={16} flush />
              <Skeleton className="view-switch" width={460} height={32} flush />
            </div>
          </div>
        </div>

        <div className="marg">
          <div className="order-panel">
            <div className="panel-top">
              <Skeleton width={64} height={28} flush />
              <Skeleton width={150} height={14} flush />
            </div>
            <Skeleton height={24} flush />
            {[0, 1, 2].flatMap((i) => [
              <Skeleton key={`l${i}`} width="45%" height={12} flush />,
              <Skeleton key={`s${i}`} height={4} flush />,
            ])}
            <Skeleton height={60} flush />
            <div className="order-actions">
              <Skeleton width="50%" height={40} flush />
              <Skeleton width="50%" height={40} flush />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
