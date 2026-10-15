/**
 * Расписание и мелочи бэкапа базы — чистые функции, без БД и процессов.
 * Спека — docs/superpowers/specs/2026-10-15-db-backup-telegram-design.md.
 */

/**
 * Последний слот бэкапа не позже `now`: понедельник, 00:00 UTC (03:00 МСК).
 * Слот в полночь, поэтому понедельник с любого часа — уже «после слота».
 */
export function lastSlot(now: Date): Date {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - sinceMonday);
  return day;
}

/**
 * Пора ли снимать: с последнего слота бэкапа не было. Пропущенный слот
 * догоняется в любой день недели, а снятый — не повторяется до следующего.
 */
export function isDue(lastSentAt: Date | null, now: Date): boolean {
  return lastSentAt == null || lastSentAt.getTime() < lastSlot(now).getTime();
}

/**
 * Адрес Prisma → переменные libpq для `pg_dump`. Параметры Prisma
 * (`connection_limit`, `schema`…) libpq не понимает и отказывается с ними
 * подключаться, а пароль в переменной, а не в строке запуска, не попадает в
 * текст ошибки.
 */
export function pgEnvOf(databaseUrl: string): Record<string, string> {
  const u = new URL(databaseUrl);
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, '')),
  };
}

/**
 * Имена частей дампа. Номер с нулём впереди: `cat file.dump.part*` склеивает
 * по алфавиту, и `part10` без нуля встал бы перед `part2`.
 */
export function partNames(file: string, count: number): string[] {
  if (count <= 1) return [file];
  return Array.from({ length: count }, (_, i) => `${file}.part${String(i + 1).padStart(2, '0')}`);
}
