import { redirect } from 'next/navigation';

/**
 * `/login` больше не страница: вход и регистрация — окно и секция на главной
 * (`views/landing`). Адрес оставлен ради старых ссылок — приглашений
 * (`?mode=register&ref=…`), закладок и писем: он пересылает на главную с теми
 * же намерениями (`auth`, `next`, `ref`), и гость попадает на ту же форму.
 */
export default async function LoginRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const out = new URLSearchParams();
  out.set('auth', first(sp.mode) === 'register' ? 'register' : 'login');
  const next = first(sp.next);
  if (next) out.set('next', next);
  const ref = first(sp.ref);
  if (ref) out.set('ref', ref);

  redirect(`/?${out.toString()}`);
}
