// Только для серверных компонентов (layout.tsx) — использует next/headers,
// которого нет в клиентском бандле. Не импортировать из index.ts сущности или
// любого 'use client' файла: это тут же потащит next/headers в клиент.
import { cookies } from 'next/headers';
import { TERMINAL_COOKIE, parseTerminalHint } from './lib/access-hint';

/** Был ли терминал доступен при последнем ответе — та же кука, что пишет `useTerminalAccess`. */
export async function getServerTerminalHint(): Promise<boolean> {
  const cookieStore = await cookies();
  return parseTerminalHint(cookieStore.get(TERMINAL_COOKIE)?.value);
}
