'use client';

import { usePeriodFilter } from './usePeriodFilter';
import { StatsHeader } from './StatsHeader';
import { OverviewTab } from './OverviewTab';

export function OverviewPage() {
  const { days, customDate, effectiveDays, setDays, setCustomDate } = usePeriodFilter();

  return (
    <div className="h-full overflow-y-auto bg-app p-3">
      <div className="mx-auto flex flex-col gap-3">
        <StatsHeader
          title="Обзор"
          days={days}
          customDate={customDate}
          onSelectDays={setDays}
          onCustomDate={setCustomDate}
        />
        <OverviewTab days={effectiveDays} />
      </div>
    </div>
  );
}
