'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { AppPart } from './app-part';

const Ctx = createContext<AppPart>('play');

export function AppPartProvider({ part, children }: { part: AppPart; children: ReactNode }) {
  return <Ctx.Provider value={part}>{children}</Ctx.Provider>;
}

/** Часть продукта. Её знает уже сервер: шапке она нужна в первой разметке, а не после гидратации. */
export const useAppPart = () => useContext(Ctx);
