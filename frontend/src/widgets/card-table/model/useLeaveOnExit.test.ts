import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { pokerViewKey } from '@/entities/game-table';
import { standUp } from './useLeaveOnExit';

vi.mock('@/shared/api/http', () => ({ apiJson: vi.fn(() => Promise.resolve({ success: true })) }));

describe('standUp', () => {
  it('не оставляет в кэше снимок стола, где я ещё сижу', async () => {
    const qc = new QueryClient();
    qc.setQueryData(pokerViewKey('t1'), { me: { seatIndex: 3 } });

    await standUp(qc, 't1', pokerViewKey);

    // Иначе при возврате за стол страница сначала показывает меня сидящим,
    // а через миг свежий ответ убирает с места.
    expect(qc.getQueryData(pokerViewKey('t1'))).toBeUndefined();
  });
});
