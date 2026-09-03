import { useSecureCookie } from './cookie-security';

describe('useSecureCookie', () => {
  it('HTTPS-фронтенд — кука только по TLS', () => {
    expect(useSecureCookie('https://virex.app')).toBe(true);
    expect(useSecureCookie('  HTTPS://VIREX.APP  ')).toBe(true);
  });

  // Выставить Secure на HTTP-развёртывании — значит выбросить куку и сломать
  // вход, поэтому здесь флага нет.
  it('HTTP-фронтенд — без флага', () => {
    expect(useSecureCookie('http://localhost:8090')).toBe(false);
  });

  it('пустое или отсутствующее значение читается как HTTP', () => {
    expect(useSecureCookie(undefined)).toBe(false);
    expect(useSecureCookie('')).toBe(false);
    expect(useSecureCookie('   ')).toBe(false);
  });

  // Схема сравнивается целиком: подстрока «https» в середине адреса ничего не
  // значит и TLS не подтверждает.
  it('не ведётся на https внутри строки', () => {
    expect(useSecureCookie('http://https.example.com')).toBe(false);
  });
});
