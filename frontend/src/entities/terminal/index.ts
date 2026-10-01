export * from './api/hooks';
export { setClientTerminalHint } from './lib/access-hint';
// `server-access.ts` сюда не входит намеренно: он тянет next/headers и
// импортируется напрямую, только из серверного layout.
