import { describe, expect, it } from 'vitest';
import { resolveApiError, setErrorMessages } from './http';

describe('resolveApiError', () => {
  it('переводит по code, если для него есть текст в текущем каталоге', () => {
    setErrorMessages({ INVALID_CREDENTIALS: 'Invalid email or password', generic: 'Error' });
    expect(
      resolveApiError({ code: 'INVALID_CREDENTIALS', message: 'Неверный email или пароль' }),
    ).toBe('Invalid email or password');
  });

  it('падает на сырой message, если код не знаком текущему каталогу', () => {
    setErrorMessages({ generic: 'Error' });
    expect(resolveApiError({ code: 'SOME_NEW_CODE', message: 'Что-то пошло не так' })).toBe(
      'Что-то пошло не так',
    );
  });

  it('склеивает message-массив (class-validator) через запятую', () => {
    setErrorMessages({ generic: 'Error' });
    expect(
      resolveApiError({ message: ['Пароль слишком короткий', 'Email обязателен'] }),
    ).toBe('Пароль слишком короткий, Email обязателен');
  });

  it('без code/message/error и без явного fallback — берёт errors.generic из каталога', () => {
    setErrorMessages({ generic: 'Authorization error' });
    expect(resolveApiError({})).toBe('Authorization error');
  });

  it('явный fallback перебивает errors.generic', () => {
    setErrorMessages({ generic: 'Authorization error' });
    expect(resolveApiError({}, 'HTTP error! status: 500')).toBe('HTTP error! status: 500');
  });
});
