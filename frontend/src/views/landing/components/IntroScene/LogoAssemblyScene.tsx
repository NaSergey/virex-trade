'use client';

import { type RefObject } from 'react';
import { VirexLogo } from '@/shared/ui/VirexLogo';

/** Сцена 01: обёртка вокруг знака — по этому рефу сборка ищет свечи и (в задаче 6) масштабирует знак целиком. */
export function LogoAssemblyScene({ groupRef }: { groupRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="ls-logo-group" ref={groupRef}>
      <VirexLogo aria-hidden />
    </div>
  );
}
