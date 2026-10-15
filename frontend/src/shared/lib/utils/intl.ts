const dates = new Map<string, Intl.DateTimeFormat>();

/**
 * Форматтер дат — один на локаль и набор опций. `toLocaleString` и его
 * родственники создают `Intl.DateTimeFormat` заново на каждый вызов, а это
 * самое дорогое во всём форматировании: подписи времени на графике терминала
 * дёргали его на каждый рендер, и в профиле прихода свечей это было первым
 * пунктом (замер 2026-10-13). `.format(d)` пишет ровно то же, что
 * `d.toLocale*String(locale, options)` с этими опциями (тест рядом).
 */
export function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = dates.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    dates.set(key, f);
  }
  return f;
}
