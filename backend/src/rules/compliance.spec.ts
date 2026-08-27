import { evaluate } from './compliance';

const RULE = { metric: 'exposure_pct', operator: 'lte' as const, threshold: 100 };

describe('evaluate', () => {
  it('считает соблюдённые и нарушенные', () => {
    const res = evaluate(RULE, [
      { subjectId: 'a', value: 50 },
      { subjectId: 'b', value: 150 },
    ]);
    expect(res).toMatchObject({ followed: 1, violated: 1, unchecked: 0, violatingIds: ['b'] });
  });

  // Ровно порог — соблюдение. «Не больше 100» включает сто, иначе правило
  // означало бы «меньше ста», а пользователь объявлял не это.
  it('значение ровно на пороге соблюдает правило', () => {
    expect(evaluate(RULE, [{ subjectId: 'a', value: 100 }])).toMatchObject({
      followed: 1,
      violated: 0,
    });
  });

  // Главное свойство всей фичи: непроверенное не засчитывается ни туда, ни
  // сюда. Иначе продукт врал бы в приятную сторону, а доверие к декларации —
  // единственное, ради чего она нужна.
  it('значение null не идёт ни в числитель, ни в знаменатель', () => {
    const res = evaluate(RULE, [
      { subjectId: 'a', value: 50 },
      { subjectId: 'b', value: null },
    ]);
    expect(res).toMatchObject({
      followed: 1,
      violated: 0,
      unchecked: 1,
      violatingIds: [],
    });
  });

  it('оператор gte разворачивает сравнение', () => {
    const res = evaluate({ metric: 'x', operator: 'gte', threshold: 10 }, [
      { subjectId: 'a', value: 5 },
      { subjectId: 'b', value: 15 },
    ]);
    expect(res).toMatchObject({ followed: 1, violated: 1, violatingIds: ['a'] });
  });

  it('пустой список — все счётчики нули, а не деление на ноль', () => {
    expect(evaluate(RULE, [])).toMatchObject({
      followed: 0,
      violated: 0,
      unchecked: 0,
      violatingIds: [],
    });
  });

  it('переносит условие правила в результат без изменений', () => {
    expect(evaluate(RULE, [])).toMatchObject({
      metric: 'exposure_pct',
      operator: 'lte',
      threshold: 100,
    });
  });

  // Нечисловые значения (NaN, Infinity) обрабатываются вместе с null, потому что
  // они тоже означают «не удалось вычислить». Формулы могут меняться, и деление
  // на баланс (нулевой или неизвестный) рано или поздно вернёт Infinity как
  // признак несчётного риска. Без этой проверки Infinity однажды тихо станет
  // нарушением, потому что Infinity > threshold всегда истинно.
  it('значение NaN попадает в unchecked, не в violated и не в violatingIds', () => {
    const res = evaluate(RULE, [
      { subjectId: 'a', value: 50 },
      { subjectId: 'b', value: NaN },
    ]);
    expect(res).toMatchObject({
      followed: 1,
      violated: 0,
      unchecked: 1,
      violatingIds: [],
    });
  });

  it('значение Infinity попадает в unchecked, не в violated и не в violatingIds', () => {
    const res = evaluate(RULE, [
      { subjectId: 'a', value: 50 },
      { subjectId: 'b', value: Infinity },
    ]);
    expect(res).toMatchObject({
      followed: 1,
      violated: 0,
      unchecked: 1,
      violatingIds: [],
    });
  });
});
