import { describe, expect, it } from 'vitest';
import { adminOrigin, adminPath, isAdminHost } from './admin-host';

describe('admin-host', () => {
  it('поддомен админки — по префиксу admin.', () => {
    expect(isAdminHost('admin.trade-play.com')).toBe(true);
    expect(isAdminHost('admin.localhost:8090')).toBe(true);
    expect(isAdminHost('trade-play.com')).toBe(false);
    expect(isAdminHost('administrator.com')).toBe(false);
    expect(isAdminHost(null)).toBe(false);
  });

  it('adminPath снимает внутренний префикс /admin', () => {
    expect(adminPath('/admin')).toBe('/');
    expect(adminPath('/admin/users')).toBe('/users');
    expect(adminPath('/saved')).toBe('/saved');
    expect(adminPath('/administrator')).toBe('/administrator');
  });

  it('adminOrigin — тот же протокол и порт', () => {
    expect(adminOrigin('https:', 'trade-play.com')).toBe('https://admin.trade-play.com');
    expect(adminOrigin('http:', 'localhost:8090')).toBe('http://admin.localhost:8090');
    expect(adminOrigin('https:', 'www.trade-play.com')).toBe('https://admin.trade-play.com');
  });
});
