import { UNKNOWN_SECTION, isTrackedPath, sectionOf } from './sections';

describe('sectionOf', () => {
  it('разводит разделы, живущие в одном контроллере', () => {
    // Журнал, «Лаборатория» и «Привычки» — это /api/trades/*, но мерить их
    // вместе бессмысленно: это разные функции продукта.
    expect(sectionOf('/api/trades')).toBe('journal');
    expect(sectionOf('/api/trades/lab')).toBe('lab');
    expect(sectionOf('/api/trades/habits')).toBe('habits');
    // Маршруты статистики отличаются от журнала дефисом, а не слэшем:
    // /api/trades/stats-by-tag — это всё ещё статистика.
    expect(sectionOf('/api/trades/stats-by-tag')).toBe('stats');
    expect(sectionOf('/api/trades/stats-by-time')).toBe('stats');
  });

  it('не путает префикс с началом другого слова', () => {
    // /api/tagsomething не должен читаться как /api/tags
    expect(sectionOf('/api/tags')).toBe('tags');
    expect(sectionOf('/api/tags/123')).toBe('tags');
    expect(sectionOf('/api/tagsomething')).toBe(UNKNOWN_SECTION);
  });

  it('игнорирует query-строку и хвостовой слэш', () => {
    expect(sectionOf('/api/trades?limit=50&symbol=BTCUSDT')).toBe('journal');
    expect(sectionOf('/api/tags/')).toBe('tags');
  });

  it('незнакомый путь не теряется, а падает в other', () => {
    expect(sectionOf('/api/whatever')).toBe(UNKNOWN_SECTION);
  });
});

describe('isTrackedPath', () => {
  it('не считает использованием продукта саму админку', () => {
    // Иначе владелец, читающий отчёт, попадает в свой же отчёт и видит рост.
    expect(isTrackedPath('/api/admin/analytics/overview')).toBe(false);
    expect(isTrackedPath('/health')).toBe(false);
  });

  it('всё остальное считает', () => {
    expect(isTrackedPath('/api/trades')).toBe(true);
    expect(isTrackedPath('/api/administration')).toBe(true);
  });
});
