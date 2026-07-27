'use client';

import { usePeriodFilter } from './usePeriodFilter';
import { StatsHeader } from './StatsHeader';
import { TagsTab } from './TagsTab';

export function TagsPage() {
  const { days, customDate, effectiveDays, setDays, setCustomDate } = usePeriodFilter();

  return (
    <div className="h-full overflow-y-auto bg-app p-3">
      <div className="mx-auto flex flex-col gap-3">
        <StatsHeader
          title="Теги"
          days={days}
          customDate={customDate}
          onSelectDays={setDays}
          onCustomDate={setCustomDate}
        />
        <TagsTab days={effectiveDays} />
      </div>
    </div>
  );
}
