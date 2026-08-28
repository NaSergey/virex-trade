'use client';

import { Wrap } from '@/shared/ui/Wrap';
import { usePeriodFilter, PeriodStrip } from '@/features/period-filter';
import { RulesList } from './components/RulesList';
import { AddRuleForm } from './components/AddRuleForm';

/**
 * Правила: числовые ограничения, которые пользователь объявил себе, и то,
 * насколько получается их соблюдать по факту сделок.
 *
 * Раньше объявление жило в Настройках (страница описывала себя как
 * «подключение биржевых аккаунтов, и только оно» — правила туда не подходили
 * по собственному описанию), а соблюдение — на Обзоре, отдельным блоком между
 * сводом и кривой P&L, с другим набором данных на то же самое правило. Здесь
 * — один список: конфигурация и факт в одной строке.
 */
export function RulesPage() {
  const period = usePeriodFilter();

  return (
    <Wrap page>
      <PeriodStrip spaced period={period} />
      <div className="set">
        <RulesList days={period.effectiveDays} />
        <AddRuleForm />
      </div>
    </Wrap>
  );
}
