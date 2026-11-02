import { BadRequestException } from '@nestjs/common';
import {
  assertReadableName,
  isReadableName,
  isRealEmail,
} from './identity-rules';

describe('isReadableName', () => {
  // Первые шесть строк — то, что на самом деле написали на проде и что владелец показал как мусор.
  it.each([
    'sdfsdfsdf',
    '12345',
    'sadasd',
    'HJhj hjhkj',
    'ыфвфыв',
    'asdf',
    'asdfgh',
    'qwerty',
    'йцукен',
    'фыва',
    'test',
    'Тест',
    'admin',
    'a1',
    'я',
    '!!!',
    '🚀🚀',
    'ab​cd',
    'ааааа',
    'xxx',
    'hahaha',
    'dfgcvb',
    'Иван sdfgh',
  ])('мусор: %s', (name) => {
    expect(isReadableName(name)).toBe(false);
  });

  // Имена из того же ряда клавиатуры — главный риск правила: отказ настоящему человеку.
  it.each([
    'Dedal',
    'ishan',
    'smoke',
    'streamer',
    'Пегова Ирина',
    'QA Validator',
    'Sasha',
    'Dasha',
    'Asad',
    'Sasa',
    'Peter',
    'Terry',
    'Yuri',
    'Вова',
    'Алла',
    'Лада',
    'Ян',
    'Jo',
    'Liberty',
    'Сапронов',
    'Ролдугин',
    "O'Neil",
    'Jean-Luc',
    'Анна-Мария',
    'Trader777',
    'crypto_king',
    'Иван И.',
    '李明',
    'José',
    'Нұрлан',
    'BTCFX',
    'wxtxn',
  ])('имя: %s', (name) => {
    expect(isReadableName(name)).toBe(true);
  });
});

describe('assertReadableName', () => {
  it('отказ — 400 с кодом: текст переводит фронт', () => {
    let caught: unknown;
    try {
      assertReadableName('12345');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).getResponse()).toMatchObject({
      code: 'NAME_NOT_READABLE',
    });
  });

  it('нормальное имя проходит молча', () => {
    expect(() => assertReadableName('Ника')).not.toThrow();
  });
});

describe('isRealEmail', () => {
  const mx = (records: { exchange: string; priority: number }[]) =>
    jest.fn(async () => records);
  const fails = (code: string) =>
    jest.fn(async () => {
      throw Object.assign(new Error(code), { code });
    });
  const mail = [{ exchange: 'mx.gmail.com', priority: 5 }];

  it.each([
    'a@example.com',
    'a@example.org',
    'a@local.test',
    'a@foo.local',
    'a@foo.invalid',
    'A@EXAMPLE.COM',
  ])('зарезервированный домен, без похода в DNS: %s', async (email) => {
    const resolve = mx(mail);
    await expect(isRealEmail(email, resolve)).resolves.toBe(false);
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each([
    'a@mailinator.com',
    'a@yopmail.com',
    'a@10minutemail.com',
    'a@Temp-Mail.org',
  ])('одноразовая почта, без похода в DNS: %s', async (email) => {
    const resolve = mx(mail);
    await expect(isRealEmail(email, resolve)).resolves.toBe(false);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('домен с почтовым сервером проходит и спрашивается в нижнем регистре', async () => {
    const resolve = mx(mail);
    await expect(isRealEmail('Ivan@GMAIL.com', resolve)).resolves.toBe(true);
    expect(resolve).toHaveBeenCalledWith('gmail.com');
  });

  it('домена нет или почтового сервера нет — отказ', async () => {
    await expect(isRealEmail('a@nosuch.xyz', fails('ENOTFOUND'))).resolves.toBe(
      false,
    );
    await expect(isRealEmail('a@nomail.xyz', fails('ENODATA'))).resolves.toBe(
      false,
    );
  });

  it('домен, объявивший, что почту не принимает (RFC 7505), — отказ', async () => {
    await expect(
      isRealEmail('a@nullmx.xyz', mx([{ exchange: '', priority: 0 }])),
    ).resolves.toBe(false);
    await expect(
      isRealEmail('a@nullmx.xyz', mx([{ exchange: '.', priority: 0 }])),
    ).resolves.toBe(false);
  });

  it.each(['ETIMEOUT', 'ECONNREFUSED', 'ESERVFAIL'])(
    'сбой DNS (%s) — не повод отказать: наша поломка не должна закрывать регистрацию',
    async (code) => {
      await expect(isRealEmail('a@gmail.com', fails(code))).resolves.toBe(true);
    },
  );
});
