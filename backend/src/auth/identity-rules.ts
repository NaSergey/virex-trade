import { BadRequestException, Logger } from '@nestjs/common';
import { Resolver } from 'node:dns/promises';

/**
 * Что принимается как имя и почта нового аккаунта (владелец 2026-11-02: люди
 * писали `12345`, `sdfsdfsdf`, `ыфвфыв`).
 *
 * Правила ловят только лень — случайный набор символов. Выдуманное, но
 * правдоподобное «Иван» они не поймают, и пытаться незачем: ошибка в эту
 * сторону — отказ настоящему человеку, что дороже одного мусорного имени.
 * Поэтому каждое правило проверено на именах из того же ряда клавиатуры
 * (Sasha, Terry, Вова — см. spec). Имя — это и ник: в продукте оно публичное,
 * в рейтинге и за столами.
 *
 * Проверка только у новых записей: регистрация и смена имени. Вход её не
 * проходит — старые аккаунты и демо (`demo@example.com`) должны входить как раньше.
 */

const ALLOWED = /^[\p{L}\p{M}\p{N} .'’_-]+$/u;
const LETTER = /\p{L}/gu;
const WORD = /[\p{L}\p{M}]+/gu;
const VOWEL = /[aeiouyаеёиоуыэюя]/;
const PLAIN_WORD = /^(?:[a-z]+|[а-яё]+)$/;

/** Что пишут, когда лень придумывать: сравнивается с именем целиком, «Lab Test» проходит. */
const PLACEHOLDERS = new Set([
  'test',
  'tester',
  'тест',
  'user',
  'admin',
  'administrator',
  'админ',
  'name',
  'имя',
  'nick',
  'none',
  'null',
  'undefined',
  'abc',
  'abcd',
  'абв',
  'абвг',
  'qwe',
  'asd',
  'zxc',
  'йцу',
  'фыв',
  'ячс',
  'qwer',
  'asdf',
  'zxcv',
  'йцук',
  'фыва',
  'ячсм',
]);

const ROWS = [
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
  'йцукенгшщзхъ',
  'фывапролджэ',
  'ячсмитьбю',
];
const HOME_ROWS = ['asdfghjkl', 'фывапролджэ'];

/**
 * Пять клавиш подряд в любую сторону. Не четыре: в «Liberty» стоит `erty`, в
 * «Сапронов» — `апро`.
 */
const KEY_RUNS = ROWS.flatMap((row) => {
  const back = [...row].reverse().join('');
  return [row, back].flatMap((keys) =>
    Array.from({ length: keys.length - 4 }, (_, i) => keys.slice(i, i + 5)),
  );
});

/**
 * Рука, лежащая на среднем ряду: все буквы оттуда и каждая следующая не дальше
 * двух клавиш. Только средний и только от пяти букв: на верхнем ряду лежат Terry
 * и Peter, а короче бывают Sasa и Asad. Sasha и Вова отсекаются шагом в 4 клавиши.
 */
function isHomeRowMash(word: string): boolean {
  if (word.length < 5) return false;
  const letters = [...word];
  return HOME_ROWS.some((row) =>
    letters.every(
      (c, i) =>
        row.includes(c) &&
        (i === 0 ||
          Math.abs(row.indexOf(c) - row.indexOf(letters[i - 1])) <= 2),
    ),
  );
}

function looksLikeMash(word: string): boolean {
  if (/(.)\1\1/u.test(word)) return true;
  if (/^(.{1,3})\1{2,}$/u.test(word)) return true;
  if (isHomeRowMash(word)) return true;
  if (KEY_RUNS.some((run) => word.includes(run))) return true;
  // От шести букв: ники вроде BTCFX бывают и без гласных.
  return word.length >= 6 && PLAIN_WORD.test(word) && !VOWEL.test(word);
}

export function isReadableName(name: string): boolean {
  const low = name.trim().toLowerCase();
  if (!ALLOWED.test(low)) return false;
  if ((low.match(LETTER)?.length ?? 0) < 2) return false;
  if (PLACEHOLDERS.has(low)) return false;
  return !(low.match(WORD) ?? []).some(looksLikeMash);
}

/** Отказ с кодом, а не текстом валидатора: сообщение переводит фронт (`errors.*`). */
export function assertReadableName(name: string): void {
  if (isReadableName(name)) return;
  throw new BadRequestException({
    message:
      'Напишите настоящее имя или ник: хотя бы две буквы, без случайного набора символов',
    code: 'NAME_NOT_READABLE',
  });
}

/** Домены, зарезервированные под примеры и тесты (RFC 2606, RFC 6761): письмо туда не дойдёт. */
const RESERVED_DOMAIN =
  /(^|\.)(example\.(com|org|net)|example|test|invalid|localhost|local)$/;

/**
 * Самые ходовые сервисы одноразовой почты. Почтовый сервер у них настоящий, DNS
 * их не отсеет. Полного списка нет намеренно: это тысячи доменов, и он устаревает.
 */
const DISPOSABLE = new Set([
  '10minutemail.com',
  '10minutemail.net',
  '1secmail.com',
  'dispostable.com',
  'dropmail.me',
  'emailondeck.com',
  'fakeinbox.com',
  'getnada.com',
  'grr.la',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'mail.gw',
  'mail.tm',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'minuteinbox.com',
  'moakt.com',
  'mohmal.com',
  'mytemp.email',
  'sharklasers.com',
  'temp-mail.org',
  'tempail.com',
  'tempmail.com',
  'tempmail.net',
  'tempmailo.com',
  'throwawaymail.com',
  'tmpmail.org',
  'trashmail.com',
  'trashmail.de',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
]);

const logger = new Logger('IdentityRules');

/**
 * Публичные серверы, а не системный: на Windows разработчика системный отвечал
 * ECONNREFUSED на всё, и проверка молча ничего бы не проверяла. Уходит только
 * домен, без адреса. Предел — одна попытка на сервер: человек ждёт ответа формы.
 */
const resolver = new Resolver({ timeout: 1500, tries: 1 });
resolver.setServers(['1.1.1.1', '8.8.8.8']);

type ResolveMx = (
  domain: string,
) => Promise<{ exchange: string; priority: number }[]>;

/**
 * Можно ли на этот адрес в принципе написать. Существует ли сам ящик, отсюда не
 * узнать: это говорит только письмо с кодом, а почты продукт не отправляет.
 *
 * Сбой DNS — не отказ: зависнувший сервер не должен закрывать регистрацию всем.
 * Отказывают только два ответа, означающие «почте сюда некуда идти». Домен без MX,
 * но с адресом сайта по RFC 5321 мог бы принять письмо, но так настроены парковки,
 * а не почта людей.
 */
export async function isRealEmail(
  email: string,
  resolveMx: ResolveMx = (domain) => resolver.resolveMx(domain),
): Promise<boolean> {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  if (RESERVED_DOMAIN.test(domain) || DISPOSABLE.has(domain)) return false;
  try {
    const records = await resolveMx(domain);
    // RFC 7505: пустой обменник — домен прямо заявляет, что почту не принимает.
    return records.some(({ exchange }) => exchange !== '' && exchange !== '.');
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') return false;
    logger.warn(`почта ${domain} не проверена: DNS ответил ${code}`);
    return true;
  }
}
