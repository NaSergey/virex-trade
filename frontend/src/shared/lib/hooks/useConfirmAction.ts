'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PendingConfirm {
  id: string;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Generic two-step "confirm again within Ns" hook.
 *
 * Single pending slot per hook instance — callers needing two independent
 * confirmation flows (e.g. stop vs delete) should call this hook twice, each
 * with its own internal state, rather than relying on multi-slot support
 * inside the hook.
 */
export const useConfirmAction = (delayMs = 4000) => {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    return () => {
      if (pendingRef.current) {
        clearTimeout(pendingRef.current.timer);
      }
    };
  }, []);

  const isConfirming = useCallback(
    (id: string) => pendingRef.current?.id === id,
    [],
  );

  const requestOrConfirm = useCallback(
    (id: string, action: () => void) => {
      const current = pendingRef.current;
      if (current?.id === id) {
        clearTimeout(current.timer);
        setPending(null);
        action();
        return;
      }

      if (current) {
        clearTimeout(current.timer);
      }

      const timer = setTimeout(() => {
        setPending((p) => (p?.id === id ? null : p));
      }, delayMs);

      setPending({ id, timer });
    },
    [delayMs],
  );

  return {
    isConfirming,
    requestOrConfirm,
    hasPending: pending !== null,
  };
};
