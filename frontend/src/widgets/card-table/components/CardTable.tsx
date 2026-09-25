'use client';

import { Fragment, type ReactNode } from 'react';
import { VirexLogo } from '@/shared/ui/VirexLogo';
import type { SeatPoint } from '../lib/layout';
import { Dealer } from './Dealer';

/**
 * Сцена карточного стола — общая у покера и блэкджека: овал сукна, крупье с
 * колодой во главе, места по овалу на равных расстояниях по его длине
 * (`seatPoint`), своё — ближайшее к низу, и слой летящих предметов поверх.
 *
 * Что лежит в центре сукна (банк и борд, рука крупье) и что сидит на месте
 * (две карты, несколько рук), решает игра — `center` и `renderSeat`. Сцена
 * держит пропорцию и вписывается в коробку `TableShell` (`.ct-stage-box`).
 */
export function CardTable({
  maxSeats,
  pointOf,
  center,
  shuffleKey,
  renderSeat,
  overlay,
}: {
  maxSeats: number;
  pointOf: (seatIndex: number) => SeatPoint;
  center: ReactNode;
  /** Id раздачи, сданной вживую, — колода тасуется на каждую новую. */
  shuffleKey: string | null;
  renderSeat: (seatIndex: number, at: SeatPoint) => ReactNode;
  overlay?: ReactNode;
}) {
  return (
    <div className="ct-stage">
      <div className="ct-felt">
        <div className="ct-felt-line" />
        <div className="ct-center">
          {center}
          <VirexLogo className="ct-logo" aria-hidden />
        </div>
      </div>

      <Dealer shuffleKey={shuffleKey} />

      {Array.from({ length: maxSeats }, (_, i) => (
        <Fragment key={i}>{renderSeat(i, pointOf(i))}</Fragment>
      ))}

      {overlay}
    </div>
  );
}
