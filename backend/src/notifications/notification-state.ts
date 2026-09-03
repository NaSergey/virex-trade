export interface StateRow {
  activeSince: Date | null;
  lastSentAt: Date | null;
}

export interface Decision {
  send: boolean;
  /** Каким должен стать activeSince после этого тика. */
  activeSince: Date | null;
}

/**
 * Решение об отправке сигнала с порогом: слать на переходе «не держалось →
 * держится», не чаще cooldown.
 *
 * Фронт отмечается даже тогда, когда отправку съел cooldown. Иначе метрика,
 * зависшая чуть выше порога, выстрелила бы ровно в момент истечения cooldown —
 * то есть по таймеру, а не по событию.
 */
export const decide = (
  state: StateRow | null,
  holds: boolean,
  now: Date,
  cooldownMs: number,
): Decision => {
  if (!holds) return { send: false, activeSince: null };
  if (state?.activeSince) return { send: false, activeSince: state.activeSince };
  const last = state?.lastSentAt?.getTime();
  const cooled = last == null || now.getTime() - last >= cooldownMs;
  return { send: cooled, activeSince: now };
};
