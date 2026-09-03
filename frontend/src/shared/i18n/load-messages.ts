import type { Locale } from './locale-storage';

/** Словарь одной локали: верхний уровень — разделы интерфейса. */
export type Messages = Record<string, any>;

/**
 * Словарь грузится динамическим импортом по локали — по одному, а не оба
 * статически.
 *
 * Прежде `ru.json` и `en.json` импортировались напрямую и в корневом
 * `layout.tsx`, и в клиентском `LocaleProvider`. Девяносто шесть килобайт
 * данных оказывались зависимостью самого верхнего модуля дерева, и любая
 * правка строки инвалидировала весь граф: Fast Refresh не мог обновить
 * страницу точечно и перезагружал её целиком, а пересборка занимала десятки
 * секунд (в логе dev-сервера — до 261 с на одну правку текста).
 *
 * Побочно это снимает с клиента второй язык: раньше каждый пользователь качал
 * оба словаря, теперь — только свой.
 */
export async function loadMessages(locale: Locale): Promise<Messages> {
  const mod = locale === 'en' ? await import('./messages/en.json') : await import('./messages/ru.json');
  return mod.default as Messages;
}
